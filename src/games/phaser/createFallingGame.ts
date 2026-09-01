import Phaser from "phaser";
import { createArcadeWorld, type ArcadeWorld } from "./arcadeWorld";
import type { ArcadeThemeId, PowerUpId } from "../shared/arcadeStages";

export interface FallingItem { id:string; prompt:string; expected:string; hanzi:string; }
export interface FallingState {
  typed:string; validPrefix:boolean; lives:number; combo:number; bestCombo:number; completed:number; total:number; score:number;
  speedFactor:number; slowMs:number; shield:number; lastPowerUp?:PowerUpId;
}
export interface FallingDifficulty {
  lives?:number; speedMultiplier?:number; acceleration?:number; rampPerMinute?:number; retryLimit?:number; theme?:ArcadeThemeId; powerUps?:PowerUpId[];
}
export interface FallingCallbacks {
  normalizeTyped:(value:string)=>string;
  isValidPrefix?:(value:string,expected:string)=>boolean;
  onState:(state:FallingState)=>void;
  onSpawn?:(item:FallingItem)=>void|Promise<void>;
  onResult:(item:FallingItem,correct:boolean,responseMs:number)=>void;
  onComplete:()=>void;
  onPowerUp?:(kind:PowerUpId)=>void;
}
export interface FallingController { typeChar:(char:string)=>void; backspace:()=>void; clear:()=>void; pause:()=>void; resume:()=>void; refresh:()=>void; destroy:()=>void; }
type TargetTone="neutral"|"correct"|"wrong";

class FallingScene extends Phaser.Scene {
  private queue:FallingItem[];
  private readonly initialTotal:number;
  private callbacks:FallingCallbacks;
  private difficulty:{lives:number;speedMultiplier:number;acceleration:number;rampPerMinute:number;retryLimit:number;theme:ArcadeThemeId;powerUps:PowerUpId[]};
  private active?:FallingItem;
  private target?:Phaser.GameObjects.Container;
  private targetCard?:Phaser.GameObjects.Graphics;
  private targetLabel?:Phaser.GameObjects.Text;
  private targetWidth=220;private targetHeight=72;
  private world?:ArcadeWorld;
  private typed="";private lives:number;private maxLives:number;private combo=0;private bestCombo=0;private completed=0;private score=0;
  private elapsedActiveMs=0;private sessionActiveMs=0;private baseSpeed=54;private speed=54;
  private retries=new Map<string,number>();private resolving=false;private ended=false;private awaitingPrompt=false;private spawnGeneration=0;private xRatio=.5;
  private slowUntil=0;private shield=0;private lastPowerUp?:PowerUpId;private awardedComboMilestones=new Set<number>();private lastStateEmitAt=0;

  constructor(items:FallingItem[],callbacks:FallingCallbacks,difficulty:FallingDifficulty={}){
    super({key:"falling"});this.queue=[...items];this.initialTotal=items.length;this.callbacks=callbacks;
    this.difficulty={lives:difficulty.lives??3,speedMultiplier:difficulty.speedMultiplier??1,acceleration:difficulty.acceleration??1,rampPerMinute:difficulty.rampPerMinute??.25,retryLimit:difficulty.retryLimit??2,theme:difficulty.theme??"night",powerUps:difficulty.powerUps??["slow","heart"]};
    this.lives=this.difficulty.lives;this.maxLives=this.difficulty.lives;
  }
  preload(){
    this.load.svg("panda-ranger","/mascot/panda-ranger.svg");
    this.load.svg("panda-ranger-run","/mascot/panda-ranger-run.svg");
    this.load.svg("panda-ranger-throw","/mascot/panda-ranger-throw.svg");
    this.load.svg("panda-ranger-happy","/mascot/panda-ranger-happy.svg");
    this.load.svg("panda-ranger-hurt","/mascot/panda-ranger-hurt.svg");
  }
  create(){this.world=createArcadeWorld(this,this.difficulty.theme);this.scale.on("resize",this.reflow,this);this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{this.spawnGeneration+=1;this.scale.off("resize",this.reflow,this);this.world?.destroy();});this.world.countdown(()=>void this.spawn());}
  update(time:number,delta:number){
    if(this.resolving||this.awaitingPrompt||!this.target||!this.active)return;
    this.elapsedActiveMs+=delta;this.sessionActiveMs+=delta;
    const minuteRamp=(this.sessionActiveMs/60000)*this.difficulty.rampPerMinute;
    const progressRamp=(this.completed/Math.max(1,this.initialTotal))*.28*this.difficulty.acceleration;
    const comboRamp=Math.min(.18,this.combo*.012);
    const slow=time<this.slowUntil?.58:1;
    const factor=Math.min(1.95,(1+minuteRamp+progressRamp+comboRamp)*slow);
    this.speed=Math.min(this.scale.height*.32,this.baseSpeed*factor);
    if(time-this.lastStateEmitAt>250){this.lastStateEmitAt=time;this.emitState();}
    this.target.y+=this.speed*(delta/1000);
    const floor=this.world?.floorY()??Math.max(120,this.scale.height*.82);
    if(this.target.y+this.targetHeight/2>floor-10)this.resolve(false);
  }
  typeChar(char:string){
    const active=this.active,target=this.target;
    if(this.awaitingPrompt||this.resolving||!active||!target||!/^[a-z0-5]$/i.test(char))return;
    this.typed+=char.toLowerCase();
    const normalized=this.callbacks.normalizeTyped(this.typed);
    const validPrefix=this.callbacks.isValidPrefix?this.callbacks.isValidPrefix(this.typed,active.expected):active.expected.startsWith(normalized);
    this.emitState();
    if(normalized===active.expected){this.resolve(true);return;}
    this.world?.typingBeat(target.x,target.y,validPrefix);
  }
  backspace(){if(this.awaitingPrompt||this.resolving)return;this.typed=this.typed.slice(0,-1);this.emitState();}
  clear(){if(this.awaitingPrompt||this.resolving)return;this.typed="";this.emitState();}
  private fontSizeFor(prompt:string){const w=this.scale.width;const base=w>=1000?54:w>=680?46:38;if(prompt.length>12)return Math.max(27,base-12);if(prompt.length>7)return Math.max(31,base-7);return base;}
  private maxLabelWidth(){return Math.max(180,Math.min(this.scale.width*.44,480));}
  private paintTarget(tone:TargetTone="neutral"){
    const card=this.targetCard,label=this.targetLabel;if(!card||!label)return;const max=this.maxLabelWidth();label.setWordWrapWidth(max,true);label.setFontSize(this.fontSizeFor(this.active?.prompt??""));
    const lw=Math.min(label.width,max);this.targetWidth=Math.max(142,lw+48);this.targetHeight=Math.max(64,label.height+26);
    const p=tone==="correct"?{fill:0x062a24,border:0x6ee7b7,text:"#ecfdf5",glow:0x34d399}:tone==="wrong"?{fill:0x3b111c,border:0xfda4af,text:"#fff1f2",glow:0xfb7185}:{fill:0x0b172a,border:0x7dd3fc,text:"#f8fbff",glow:0x38bdf8};
    label.setColor(p.text).setStroke("#020617",tone==="neutral"?2:1);card.clear();card.fillStyle(p.glow,tone==="neutral"?.12:.2);card.fillRoundedRect(-this.targetWidth/2-9,-this.targetHeight/2-9,this.targetWidth+18,this.targetHeight+18,24);card.fillStyle(0x020617,.38);card.fillRoundedRect(-this.targetWidth/2+5,-this.targetHeight/2+8,this.targetWidth,this.targetHeight,18);card.fillStyle(p.fill,.96);card.fillRoundedRect(-this.targetWidth/2,-this.targetHeight/2,this.targetWidth,this.targetHeight,18);card.lineStyle(2.5,p.border,.96);card.strokeRoundedRect(-this.targetWidth/2,-this.targetHeight/2,this.targetWidth,this.targetHeight,18);
  }
  private reflow(){this.world?.reflow();if(!this.target)return;const w=this.scale.width,safe=Math.max(88,Math.min(150,w*.13));this.target.setX(Phaser.Math.Clamp(w*this.xRatio,safe,w-safe));this.paintTarget("neutral");this.world?.followTarget(this.target.x);}
  private nextXRatio(prompt:string){if(prompt.length>9)return .60;if(this.scale.width<560)return [.54,.72][Phaser.Math.Between(0,1)] ?? .62;const slots=[.43,.59,.72];return slots[Phaser.Math.Between(0,slots.length-1)] ?? .59;}
  private destroyTarget(){this.target?.destroy(true);this.target=undefined;this.targetCard=undefined;this.targetLabel=undefined;}
  private async spawn(){
    if(this.ended)return;const generation=++this.spawnGeneration;this.destroyTarget();this.typed="";this.resolving=false;this.awaitingPrompt=false;const next=this.queue.shift();if(!next||this.lives<=0){this.completeOnce();return;}
    this.active=next;this.elapsedActiveMs=0;this.baseSpeed=Math.max(38,this.scale.height*.058)*this.difficulty.speedMultiplier;this.xRatio=this.nextXRatio(next.prompt);const startY=Math.max(88,this.scale.height*.18);
    const card=this.add.graphics();const label=this.add.text(0,0,next.prompt,{fontFamily:'"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif',fontSize:`${this.fontSizeFor(next.prompt)}px`,fontStyle:"800",color:"#f8fbff",align:"center",wordWrap:{width:this.maxLabelWidth(),useAdvancedWrap:true}}).setOrigin(.5).setResolution(Math.min(4,Math.max(2,window.devicePixelRatio||1)));
    this.targetCard=card;this.targetLabel=label;this.target=this.add.container(this.scale.width*this.xRatio,startY,[card,label]).setDepth(8);this.paintTarget();this.world?.followTarget(this.target.x);this.emitState();
    const promptResult=this.callbacks.onSpawn?.(next);if(promptResult&&typeof (promptResult as Promise<void>).then==="function"){this.awaitingPrompt=true;this.target.setAlpha(.58);try{await promptResult;}catch{}if(this.ended||generation!==this.spawnGeneration||this.active!==next||!this.target)return;this.awaitingPrompt=false;this.elapsedActiveMs=0;this.target.setAlpha(1);}
  }
  private choosePowerUp():PowerUpId|undefined{
    const allowed=this.difficulty.powerUps;if(!allowed.length)return;
    if(this.lives<this.maxLives&&allowed.includes("heart"))return "heart";
    if(this.shield===0&&allowed.includes("shield"))return "shield";
    if(allowed.includes("slow"))return "slow";
    return allowed[0];
  }
  private applyPowerUp(kind:PowerUpId,x:number,y:number){
    this.lastPowerUp=kind;this.world?.collectPowerUp(kind,x,y);this.callbacks.onPowerUp?.(kind);this.score+=150;
    if(kind==="heart")this.lives=Math.min(this.maxLives,this.lives+1);
    if(kind==="shield")this.shield=1;
    if(kind==="slow")this.slowUntil=Math.max(this.slowUntil,this.time.now+5500);
    this.emitState();
  }
  private maybeAwardPowerUp(x:number,y:number){
    const milestone=Math.floor(this.combo/5)*5;if(milestone<5||this.awardedComboMilestones.has(milestone))return;this.awardedComboMilestones.add(milestone);const kind=this.choosePowerUp();if(kind)this.time.delayedCall(150,()=>this.applyPowerUp(kind,x,y));
  }
  private resolve(correct:boolean){
    const item=this.active,target=this.target;if(!item||!target||this.awaitingPrompt||this.resolving||this.ended)return;this.resolving=true;this.active=undefined;const responseMs=Math.round(this.elapsedActiveMs);this.callbacks.onResult(item,correct,responseMs);
    if(correct){
      this.combo++;this.bestCombo=Math.max(this.bestCombo,this.combo);this.completed++;const speedBonus=Math.max(0,65-Math.floor(responseMs/120));this.score+=100+Math.min(140,this.combo*12)+speedBonus;this.paintTarget("correct");const hitX=target.x,hitY=target.y;this.maybeAwardPowerUp(hitX,hitY);
      this.world?.throwProjectile(hitX,hitY,()=>{this.world?.celebrate();this.tweens.add({targets:target,scaleX:1.12,scaleY:1.12,alpha:0,duration:320,ease:"Back.easeIn",onComplete:()=>void this.spawn()});});
    }else{
      this.combo=0;let blocked=false;if(this.shield>0){this.shield-=1;blocked=true;}else this.lives-=1;this.paintTarget("wrong");this.world?.reactWrong();const originalX=target.x;this.tweens.add({targets:target,x:originalX-9,duration:55,yoyo:true,repeat:3,onComplete:()=>target.setX(originalX)});const count=this.retries.get(item.id)??0;if(count<this.difficulty.retryLimit&&this.lives>0){this.retries.set(item.id,count+1);this.queue.splice(Math.min(3,this.queue.length),0,item);}if(blocked)this.score=Math.max(0,this.score-25);this.time.delayedCall(720,()=>void this.spawn());
    }
    this.emitState();
  }
  private completeOnce(){if(this.ended)return;this.ended=true;this.spawnGeneration+=1;this.active=undefined;this.emitState();this.callbacks.onComplete();}
  private emitState(){const minuteRamp=(this.sessionActiveMs/60000)*this.difficulty.rampPerMinute;const progressRamp=(this.completed/Math.max(1,this.initialTotal))*.28*this.difficulty.acceleration;const comboRamp=Math.min(.18,this.combo*.012);const slow=this.time.now<this.slowUntil?.58:1;this.callbacks.onState({typed:this.typed,validPrefix:!this.active||(this.callbacks.isValidPrefix?this.callbacks.isValidPrefix(this.typed,this.active.expected):this.active.expected.startsWith(this.callbacks.normalizeTyped(this.typed))),lives:this.lives,combo:this.combo,bestCombo:this.bestCombo,completed:this.completed,total:this.initialTotal,score:this.score,speedFactor:Math.min(1.95,(1+minuteRamp+progressRamp+comboRamp)*slow),slowMs:Math.max(0,this.slowUntil-this.time.now),shield:this.shield,lastPowerUp:this.lastPowerUp});}
}

export function createFallingGame(parent:HTMLElement,items:FallingItem[],callbacks:FallingCallbacks,difficulty:FallingDifficulty={}):FallingController{
  const scene=new FallingScene(items,callbacks,difficulty);const width=Math.max(320,Math.floor(parent.clientWidth||960)),height=Math.max(320,Math.floor(parent.clientHeight||560));
  const game=new Phaser.Game({type:Phaser.AUTO,parent,width,height,backgroundColor:"#08111f",scene,scale:{mode:Phaser.Scale.RESIZE,autoCenter:Phaser.Scale.CENTER_BOTH,width,height},render:{antialias:true,antialiasGL:true,roundPixels:false,powerPreference:"high-performance"}});
  const refresh=()=>{const w=Math.max(320,Math.floor(parent.clientWidth)),h=Math.max(320,Math.floor(parent.clientHeight));if(w&&h)game.scale.resize(w,h);game.scale.refresh();};
  return{typeChar:(c)=>scene.typeChar(c),backspace:()=>scene.backspace(),clear:()=>scene.clear(),pause:()=>game.scene.pause("falling"),resume:()=>game.scene.resume("falling"),refresh,destroy:()=>game.destroy(true)};
}
