import Phaser from "phaser";
import { createArcadeWorld, type ArcadeWorld } from "./arcadeWorld";
import type { ArcadeThemeId } from "../shared/arcadeStages";

export interface ShooterQuestion { id:string; prompt:string; correctId:string; options:{id:string;label:string}[]; }
export interface ShooterState { lives:number; combo:number; bestCombo:number; completed:number; total:number; score:number; speedFactor:number; }
export interface ShooterDifficulty { lives?:number; speedMultiplier?:number; acceleration?:number; rampPerMinute?:number; retryLimit?:number; theme?:ArcadeThemeId; }
export interface ShooterCallbacks {
  onPrompt?: (question:ShooterQuestion)=>void | Promise<void>;
  onResult:(question:ShooterQuestion,correct:boolean,responseMs:number)=>void;
  onState:(state:ShooterState)=>void;
  onComplete:()=>void;
}
export interface ShooterController { choose:(index:number)=>void; pause:()=>void; resume:()=>void; refresh:()=>void; destroy:()=>void; }
type Target = { id:string; container:Phaser.GameObjects.Container; shadow:Phaser.GameObjects.Rectangle; bg:Phaser.GameObjects.Rectangle; label:Phaser.GameObjects.Text; badge:Phaser.GameObjects.Text; };

class ShooterScene extends Phaser.Scene {
  private queue:ShooterQuestion[];
  private readonly initialTotal:number;
  private callbacks:ShooterCallbacks;
  private difficulty:{lives:number;speedMultiplier:number;acceleration:number;rampPerMinute:number;retryLimit:number;theme:ArcadeThemeId;};
  private current?:ShooterQuestion;
  private targets:Target[]=[];
  private world?:ArcadeWorld;
  private lives:number;
  private combo=0;
  private bestCombo=0;
  private score=0;
  private completed=0;
  private elapsedActiveMs=0;
  private sessionActiveMs=0;
  private baseSpeed=34;
  private speed=34;
  private speedFactor=1;
  private locked=false;
  private ended=false;
  private awaitingPrompt=false;
  private promptGeneration=0;
  private retries=new Map<string,number>();
  private fallOffset=0;

  constructor(items:ShooterQuestion[],callbacks:ShooterCallbacks,difficulty:ShooterDifficulty={}){
    super({key:"shooter"});
    this.queue=[...items];this.initialTotal=items.length;this.callbacks=callbacks;
    this.difficulty={lives:difficulty.lives??3,speedMultiplier:difficulty.speedMultiplier??1,acceleration:difficulty.acceleration??1,rampPerMinute:difficulty.rampPerMinute??.24,retryLimit:difficulty.retryLimit??2,theme:difficulty.theme??"night"};
    this.lives=this.difficulty.lives;
  }
  preload(){
    this.load.image("panda-ranger","/mascot/panda-ranger.png");
    this.load.image("panda-ranger-throw","/mascot/panda-ranger-throw.png");
    this.load.image("panda-ranger-happy","/mascot/panda-ranger-happy.png");
    this.load.image("panda-ranger-hurt","/mascot/panda-ranger-hurt.png");
  }
  create(){
    this.world=createArcadeWorld(this,this.difficulty.theme,true);
    this.scale.on("resize",this.reflow,this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{this.promptGeneration+=1;this.scale.off("resize",this.reflow,this);this.world?.destroy();});
    this.world.countdown(()=>void this.spawn());
  }
  update(_t:number,delta:number){
    if(this.awaitingPrompt||this.locked||this.ended)return;
    this.elapsedActiveMs+=delta;this.sessionActiveMs+=delta;
    const minuteRamp=(this.sessionActiveMs/60000)*this.difficulty.rampPerMinute;const progressRamp=(this.completed/Math.max(1,this.initialTotal))*.24*this.difficulty.acceleration;const comboRamp=Math.min(.14,this.combo*.01);this.speedFactor=Math.min(1.8,1+minuteRamp+progressRamp+comboRamp);this.speed=this.baseSpeed*this.speedFactor;
    const dy=this.speed*(delta/1000);this.fallOffset+=dy;
    for(const target of this.targets)target.container.y+=dy;
    const floor=this.world?.floorY()??this.scale.height*.82;
    if(this.targets.some((target)=>target.container.y+target.container.height/2>floor-14))this.submit("");
  }
  private clearTargets(){this.targets.forEach((target)=>target.container.destroy(true));this.targets=[];}
  private layout(){
    const w=this.scale.width,h=this.scale.height;
    const wide=w>=900;
    const targetH=78;
    if(wide){
      const heroLane=Math.max(180,Math.min(230,w*.19));
      const available=Math.max(0,w-heroLane);
      const targetW=Math.min(190,Math.max(132,(available-60)/4));
      const gap=Math.max(12,(available-targetW*4)/5);
      const y=Math.max(160,h*.28);
      return Array.from({length:4},(_,i)=>({x:heroLane+gap+(targetW/2)+i*(targetW+gap),y,w:targetW,h:targetH}));
    }
    const heroLane=Math.max(100,Math.min(130,w*.28));
    const available=Math.max(0,w-heroLane-12);
    const gapX=12;
    const targetW=Math.min(205,Math.max(92,(available-gapX)/2));
    const used=targetW*2+gapX;
    const startX=heroLane+Math.max(0,(available-used)/2);
    const y=Math.max(164,h*.30);
    return [0,1,2,3].map((i)=>({x:startX+targetW/2+(i%2)*(targetW+gapX),y:y+Math.floor(i/2)*98,w:targetW,h:targetH}));
  }
  private reflow(){
    this.world?.reflow();
    const layout=this.layout();
    this.targets.forEach((target,index)=>{
      const p=layout[index];if(!p)return;
      target.container.setPosition(p.x,p.y+this.fallOffset);target.container.setSize(p.w,p.h);
      target.shadow.setSize(p.w,p.h);target.bg.setSize(p.w,p.h);
      target.label.setWordWrapWidth(Math.max(80,p.w-34),true);
      target.badge.setPosition(-p.w/2+16,-p.h/2+14);
    });
  }
  private async spawn(){
    if(this.ended)return;
    const generation=++this.promptGeneration;this.clearTargets();
    const q=this.queue.shift();if(!q||this.lives<=0){this.completeOnce();return;}
    this.current=q;this.locked=false;this.awaitingPrompt=false;this.fallOffset=0;this.elapsedActiveMs=0;
    const base=Math.max(24,this.scale.height*.045);
    this.baseSpeed=Math.min(this.scale.height*.17,base*this.difficulty.speedMultiplier);
    const layout=this.layout();
    q.options.forEach((option,index)=>{
      const p=layout[index]!;
      const shadow=this.add.rectangle(3,7,p.w,p.h,0x020617,.38);
      const bg=this.add.rectangle(0,0,p.w,p.h,0x0b172a,.96).setStrokeStyle(2,0x6ec8ee,.92);
      const pixelRatio=Math.min(4,Math.max(2,window.devicePixelRatio||1));
      const label=this.add.text(0,3,option.label,{fontFamily:'"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif',fontSize:option.label.length>7?"20px":"30px",fontStyle:"800",color:"#f8fbff",stroke:"#020617",strokeThickness:2,align:"center",wordWrap:{width:p.w-34,useAdvancedWrap:true}}).setOrigin(.5).setResolution(pixelRatio);
      const badge=this.add.text(-p.w/2+16,-p.h/2+14,String(index+1),{fontFamily:'system-ui,sans-serif',fontSize:"12px",fontStyle:"800",color:"#102038",backgroundColor:"#f6c453",padding:{x:6,y:3}}).setOrigin(.5).setResolution(pixelRatio);
      const container=this.add.container(p.x,p.y,[shadow,bg,label,badge]).setDepth(8);
      container.setSize(p.w,p.h).setInteractive(new Phaser.Geom.Rectangle(-p.w/2,-p.h/2,p.w,p.h),Phaser.Geom.Rectangle.Contains);
      container.on("pointerdown",()=>this.submit(option.id));
      this.targets.push({id:option.id,container,shadow,bg,label,badge});
    });
    this.emitState();
    const promptResult=this.callbacks.onPrompt?.(q);
    if(promptResult&&typeof (promptResult as Promise<void>).then==="function"){
      this.awaitingPrompt=true;this.targets.forEach((target)=>{target.container.disableInteractive();target.container.setAlpha(.72);});
      try{await promptResult;}catch{/* audio failure must not deadlock the round */}
      if(this.ended||generation!==this.promptGeneration||this.current!==q)return;
      this.awaitingPrompt=false;this.elapsedActiveMs=0;
      this.targets.forEach((target)=>{target.container.setAlpha(1);target.container.setInteractive(new Phaser.Geom.Rectangle(-target.container.width/2,-target.container.height/2,target.container.width,target.container.height),Phaser.Geom.Rectangle.Contains);});
    }
  }
  choose(index:number){if(this.awaitingPrompt||this.locked||this.ended)return;const option=this.current?.options[index];if(option)this.submit(option.id);}
  private submit(id:string){
    if(this.awaitingPrompt||this.locked||!this.current||this.ended)return;
    this.locked=true;const q=this.current;this.current=undefined;const ok=id===q.correctId;const responseMs=Math.round(this.elapsedActiveMs);this.callbacks.onResult(q,ok,responseMs);
    let correctTarget:Target|undefined;
    for(const target of this.targets){
      if(target.id===q.correctId){correctTarget=target;target.bg.setFillStyle(0x062a24,.98).setStrokeStyle(3,0x6ee7b7,1);target.label.setColor("#ecfdf5");}
      else if(target.id===id){target.bg.setFillStyle(0x3b111c,.98).setStrokeStyle(3,0xfda4af,1);target.label.setColor("#fff1f2");}
      target.container.disableInteractive();
    }
    if(ok){
      this.combo++;this.bestCombo=Math.max(this.bestCombo,this.combo);this.completed++;
      const speedBonus=Math.max(0,55-Math.floor(responseMs/140));this.score+=100+Math.min(100,this.combo*10)+speedBonus;
      if(correctTarget){
        const target=correctTarget;
        const x=target.container.x,y=target.container.y;
        this.world?.throwProjectile(x,y,()=>{this.world?.celebrate();this.tweens.add({targets:target.container,scaleX:1.08,scaleY:1.08,alpha:0,duration:320,onComplete:()=>void this.spawn()});});
      }else this.time.delayedCall(420,()=>void this.spawn());
    }else{
      this.combo=0;this.lives--;this.world?.reactWrong();
      const count=this.retries.get(q.id)??0;if(count<this.difficulty.retryLimit&&this.lives>0){this.retries.set(q.id,count+1);this.queue.splice(Math.min(3,this.queue.length),0,q);}
      this.time.delayedCall(650,()=>void this.spawn());
    }
    this.emitState();
  }
  private completeOnce(){if(this.ended)return;this.ended=true;this.promptGeneration+=1;this.current=undefined;this.emitState();this.callbacks.onComplete();}
  private emitState(){this.callbacks.onState({lives:this.lives,combo:this.combo,bestCombo:this.bestCombo,completed:this.completed,total:this.initialTotal,score:this.score,speedFactor:this.speedFactor});}
}

export function createShooterGame(parent:HTMLElement,items:ShooterQuestion[],callbacks:ShooterCallbacks,difficulty:ShooterDifficulty={}):ShooterController{
  const scene=new ShooterScene(items,callbacks,difficulty);const width=Math.max(320,Math.floor(parent.clientWidth||960));const height=Math.max(320,Math.floor(parent.clientHeight||560));
  const game=new Phaser.Game({type:Phaser.AUTO,parent,width,height,backgroundColor:"#0d1826",scene,scale:{mode:Phaser.Scale.RESIZE,autoCenter:Phaser.Scale.CENTER_BOTH,width,height},render:{antialias:true,antialiasGL:true,roundPixels:false,powerPreference:"high-performance"}});
  const refresh=()=>{const w=Math.max(320,Math.floor(parent.clientWidth));const h=Math.max(320,Math.floor(parent.clientHeight));if(w&&h)game.scale.resize(w,h);game.scale.refresh();};
  const resizeObserver=new ResizeObserver(()=>refresh());resizeObserver.observe(parent);
  return{choose:(index)=>scene.choose(index),pause:()=>game.scene.pause("shooter"),resume:()=>game.scene.resume("shooter"),refresh,destroy:()=>{resizeObserver.disconnect();game.destroy(true);}};
}
