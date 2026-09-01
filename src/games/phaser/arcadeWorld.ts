import Phaser from "phaser";
import type { ArcadeThemeId, PowerUpId } from "../shared/arcadeStages";

export interface ArcadeWorld {
  floorY: () => number;
  heroPosition: () => { x: number; y: number };
  followTarget: (x: number) => void;
  typingBeat: (x: number, y: number, correctPrefix: boolean) => void;
  throwProjectile: (x: number, y: number, onImpact?: () => void) => void;
  burst: (x: number, y: number, color?: number) => void;
  reactWrong: () => void;
  celebrate: () => void;
  collectPowerUp: (kind: PowerUpId, x: number, y: number) => void;
  countdown: (onDone: () => void) => void;
  reflow: () => void;
  destroy: () => void;
}

const THEMES: Record<ArcadeThemeId, { top:number; bottom:number; horizon:number; ridge:number; ridge2:number; ground:number; moon:number; accent:number }> = {
  dusk: { top:0x10182a, bottom:0x3a4866, horizon:0xf3a77b, ridge:0x26344d, ridge2:0x43516b, ground:0xe8f1fb, moon:0xffd9a3, accent:0xf6a6b7 },
  night: { top:0x08111f, bottom:0x24324a, horizon:0x7998c2, ridge:0x17243a, ridge2:0x31425e, ground:0xe8f1fb, moon:0xdce9f7, accent:0xf6a6b7 },
  storm: { top:0x111827, bottom:0x34425a, horizon:0x8093ad, ridge:0x1d293b, ridge2:0x43516b, ground:0xdce8f4, moon:0xcbd8e8, accent:0xa7c7ff },
  redmoon: { top:0x160f1c, bottom:0x342337, horizon:0xb85f74, ridge:0x261827, ridge2:0x4a2d3c, ground:0xe8dce4, moon:0xff9aa9, accent:0xffb4c1 }
};

const STAR_POINTS: Array<[number, number]> = [
  [.06,.12],[.13,.22],[.19,.09],[.25,.29],[.31,.16],[.36,.34],[.42,.10],[.48,.25],[.55,.14],[.62,.31],[.69,.18],[.75,.09],[.82,.28],[.90,.18],[.95,.36],
  [.09,.42],[.18,.50],[.28,.39],[.39,.48],[.51,.40],[.60,.52],[.72,.43],[.84,.49],[.92,.41]
];

function mixColor(a:number,b:number,t:number){
  const ar=(a>>16)&255,ag=(a>>8)&255,ab=a&255,br=(b>>16)&255,bg=(b>>8)&255,bb=b&255;
  return ((Math.round(ar+(br-ar)*t)<<16)|(Math.round(ag+(bg-ag)*t)<<8)|Math.round(ab+(bb-ab)*t))>>>0;
}

export function createArcadeWorld(scene: Phaser.Scene, themeId: ArcadeThemeId, compactHero = false): ArcadeWorld {
  const theme = THEMES[themeId];
  const backdrop = scene.add.graphics().setDepth(-20);
  const decor = scene.add.graphics().setDepth(-15);
  const midground = scene.add.graphics().setDepth(-10);
  const foreground = scene.add.graphics().setDepth(-5);
  const heroShadow = scene.add.ellipse(0,0,128,28,0x020617,0.22).setDepth(1);
  const hero = scene.add.image(0,0,"panda-ranger").setDepth(3).setOrigin(.5,.82);
  const ambient: Phaser.GameObjects.Arc[] = [];
  let floor = scene.scale.height * .82;
  let heroExpressionGeneration = 0;
  let heroXRatio = compactHero ? .10 : .14;
  let heroShadowScaleX = 1;
  let heroShadowScaleY = 1;

  const redraw = () => {
    const w=scene.scale.width,h=scene.scale.height;
    floor=h*.82;
    backdrop.clear();
    backdrop.fillGradientStyle(theme.top,theme.top,theme.bottom,theme.bottom,1,1,1,1);backdrop.fillRect(0,0,w,floor);
    backdrop.fillGradientStyle(theme.horizon,theme.horizon,theme.horizon,theme.horizon,0,0,.2,.2);backdrop.fillRect(0,floor-h*.32,w,h*.32);
    backdrop.fillStyle(theme.ground,1);backdrop.fillRect(0,floor,w,h-floor);
    backdrop.fillStyle(0xffffff,.48);backdrop.fillRect(0,floor,w,Math.max(4,h*.012));

    decor.clear();
    const moonX=w*.84,moonY=h*.16,moonR=Math.min(54,Math.max(28,w*.04));
    decor.fillStyle(theme.moon,.055);decor.fillCircle(moonX,moonY,moonR*1.65);
    decor.fillStyle(theme.moon,.12);decor.fillCircle(moonX,moonY,moonR*1.35);
    decor.fillStyle(theme.moon,.98);decor.fillCircle(moonX,moonY,moonR);
    decor.fillStyle(mixColor(theme.moon,0x7890aa,.46),.35);decor.fillCircle(moonX-moonR*.22,moonY-moonR*.18,moonR*.13);decor.fillCircle(moonX+moonR*.17,moonY+moonR*.1,moonR*.18);
    for(const [i,[x,y]] of STAR_POINTS.entries()){
      decor.fillStyle(i%6===0?0xf8b4c7:0xf6fbff,i%4===0?.9:.58);decor.fillCircle(w*x,h*y,i%5===0?2.1:1.2);
    }
    midground.clear();
    midground.fillStyle(theme.ridge2,.46);
    midground.fillTriangle(-w*.08,floor,w*.15,floor-h*.17,w*.40,floor);
    midground.fillTriangle(w*.22,floor,w*.52,floor-h*.15,w*.78,floor);
    midground.fillTriangle(w*.58,floor,w*.86,floor-h*.18,w*1.10,floor);
    midground.fillStyle(theme.ridge,.88);
    midground.fillTriangle(-w*.05,floor,w*.18,floor-h*.105,w*.36,floor);
    midground.fillTriangle(w*.24,floor,w*.46,floor-h*.088,w*.68,floor);
    midground.fillTriangle(w*.60,floor,w*.80,floor-h*.10,w*1.03,floor);
    midground.lineStyle(2,theme.horizon,.22);midground.lineBetween(0,floor-h*.18,w,floor-h*.18);

    foreground.clear();
    foreground.fillStyle(mixColor(theme.ground,theme.ridge,.13),.72);
    foreground.fillTriangle(-w*.12,floor+h*.08,w*.20,floor-h*.015,w*.47,floor+h*.08);
    foreground.fillTriangle(w*.50,floor+h*.08,w*.78,floor-h*.02,w*1.12,floor+h*.08);
    foreground.lineStyle(3,0x5b4637,.68);
    [0.07,0.21,0.65,0.82,0.94].forEach((x,index)=>{
      const baseX=w*x,lean=index%2?6:-5;
      foreground.strokeLineShape(new Phaser.Geom.Line(baseX,floor,baseX+lean,floor-44));
      foreground.fillStyle(theme.accent,.9);foreground.fillCircle(baseX+lean,floor-45,4);foreground.fillCircle(baseX+lean+(index%2?6:-5),floor-38,3);
    });

    const responsiveScale=compactHero?(w<560?w/4700:Math.min(w/3400,h/1900)):(w<560?w/4300:Math.min(w/2800,h/1700));
    const heroScale=compactHero?Phaser.Math.Clamp(responsiveScale,.055,.095):Phaser.Math.Clamp(responsiveScale,.07,.11);
    const heroShadowScale=compactHero?Phaser.Math.Clamp(heroScale*1.45,.24,.46):Phaser.Math.Clamp(heroScale*1.75,.36,.62);
    hero.setScale(heroScale);
    hero.setPosition(w*heroXRatio,floor+(compactHero?15:8));
    heroShadowScaleX=heroShadowScale;heroShadowScaleY=heroShadowScale;heroShadow.setScale(heroShadowScaleX,heroShadowScaleY);
    heroShadow.setPosition(hero.x,floor+6);
  };

  redraw();
  const ambientCount=themeId==="storm"?24:themeId==="redmoon"?18:14;
  for(let i=0;i<ambientCount;i++){
    const dot=scene.add.circle(Phaser.Math.Between(12,Math.max(24,scene.scale.width-12)),Phaser.Math.Between(18,Math.max(40,Math.floor(scene.scale.height*.68))),i%4===0?2:1.15,theme.accent,themeId==="storm"?.42:.22).setDepth(-4);
    ambient.push(dot);
    scene.tweens.add({targets:dot,x:dot.x+Phaser.Math.Between(-36,36),y:dot.y+Phaser.Math.Between(30,96),alpha:{from:dot.alpha,to:.04},duration:Phaser.Math.Between(1900,3600),yoyo:true,repeat:-1,ease:"Sine.easeInOut"});
  }
  scene.scale.on("resize",redraw);

  const followTarget=(x:number)=>{
    if(compactHero)return;
    const w=scene.scale.width;
    const offset=Math.max(82,hero.displayWidth*.52);
    const destination=Phaser.Math.Clamp(x-offset,hero.displayWidth*.5+14,w-hero.displayWidth*.5-14);
    const distance=Math.abs(destination-hero.x);
    heroXRatio=destination/Math.max(1,w);
    if(distance<10){hero.setX(destination);heroShadow.setX(destination);return;}
    const expression=++heroExpressionGeneration;
    const fromX=hero.x,restY=floor+8;
    const travel={progress:0};
    scene.tweens.killTweensOf(hero);scene.tweens.killTweensOf(heroShadow);
    hero.setTexture("panda-ranger-run").clearTint().setAngle(0);
    scene.tweens.add({
      targets:travel,progress:1,duration:Phaser.Math.Clamp(220+distance*1.25,260,620),ease:"Sine.easeInOut",
      onUpdate:()=>{
        if(expression!==heroExpressionGeneration)return;
        const step=Math.sin(travel.progress*Math.PI*8);
        hero.setPosition(Phaser.Math.Linear(fromX,destination,travel.progress),restY-Math.abs(step)*5).setAngle(step*1.6);
        heroShadow.setX(hero.x).setScale(heroShadowScaleX*(1-Math.abs(step)*.018),heroShadowScaleY);
      },
      onComplete:()=>{
        if(expression!==heroExpressionGeneration)return;
        hero.setTexture("panda-ranger").setPosition(destination,restY).setAngle(0);heroShadow.setPosition(destination,floor+6).setScale(heroShadowScaleX,heroShadowScaleY);
      }
    });
  };

  const typingBeat=(x:number,y:number,correctPrefix:boolean)=>{
    const expression=++heroExpressionGeneration;
    const originalX=hero.x,originalY=floor+(compactHero?15:8);
    scene.tweens.killTweensOf(hero);
    hero.setPosition(originalX,originalY).setAngle(0).clearTint();
    heroShadow.setPosition(originalX,floor+6).setScale(heroShadowScaleX,heroShadowScaleY);
    if(!correctPrefix){
      hero.setTexture("panda-ranger-hurt").setTint(0xffe4e7);
      const cue=scene.add.text(hero.x,hero.y-hero.displayHeight*.72,"×",{fontFamily:"system-ui,sans-serif",fontSize:"26px",fontStyle:"900",color:"#fda4af",stroke:"#3b111c",strokeThickness:4}).setOrigin(.5).setDepth(32).setResolution(Math.min(4,Math.max(2,window.devicePixelRatio||1)));
      const miss=scene.add.graphics().setDepth(27).setPosition(hero.x+hero.displayWidth*.3,hero.y-hero.displayHeight*.3);
      miss.fillStyle(0xfb7185,1);miss.fillTriangle(0,-8,4,0,-4,0);miss.fillTriangle(8,0,0,4,0,-4);miss.fillTriangle(0,8,-4,0,4,0);miss.fillTriangle(-8,0,0,-4,0,4);
      const missX=hero.x+(x>=hero.x?96:-96),missY=Math.min(floor-5,y+90);
      scene.tweens.add({targets:miss,x:missX,y:missY,rotation:Math.PI*4,alpha:0,duration:220,ease:"Quad.easeIn",onComplete:()=>miss.destroy()});
      scene.tweens.add({targets:cue,y:cue.y-18,alpha:0,duration:330,ease:"Quad.easeOut",onComplete:()=>cue.destroy()});
      scene.tweens.add({targets:hero,x:originalX-5,duration:48,yoyo:true,repeat:2,onComplete:()=>hero.setPosition(originalX,originalY)});
      scene.time.delayedCall(360,()=>{if(expression===heroExpressionGeneration)hero.setTexture("panda-ranger").clearTint().setPosition(originalX,originalY).setAngle(0);});
      return;
    }
    hero.setTexture("panda-ranger-throw").setAngle(-1.5);
    const from={x:hero.x+hero.displayWidth*.39,y:hero.y-hero.displayHeight*.34};
    const distance=Phaser.Math.Distance.Between(from.x,from.y,x,y);
    const flight={progress:0};
    const star=scene.add.graphics().setDepth(27).setPosition(from.x,from.y);
    star.fillStyle(0x7dd3fc,1);star.fillTriangle(0,-9,3,-2,-3,-2);star.fillTriangle(9,0,2,3,2,-3);star.fillTriangle(0,9,-3,2,3,2);star.fillTriangle(-9,0,-2,-3,-2,3);star.fillStyle(0xf6c453,1);star.fillCircle(0,0,2.8);
    scene.tweens.add({
      targets:flight,progress:1,duration:Phaser.Math.Clamp(135+distance*.09,170,270),ease:"Sine.easeInOut",
      onUpdate:()=>{const progress=flight.progress;star.setPosition(Phaser.Math.Linear(from.x,x,progress),Phaser.Math.Linear(from.y,y,progress)-Math.sin(progress*Math.PI)*24).setRotation(progress*Math.PI*5);},
      onComplete:()=>{
        star.destroy();
        const ping=scene.add.circle(x,y,7,0x7dd3fc,0).setStrokeStyle(2,0xbae6fd,.85).setDepth(26);
        scene.tweens.add({targets:ping,scale:2.2,alpha:0,duration:170,ease:"Quad.easeOut",onComplete:()=>ping.destroy()});
      }
    });
    scene.tweens.add({targets:hero,x:originalX-3,duration:65,yoyo:true,ease:"Sine.easeOut",onComplete:()=>hero.setPosition(originalX,originalY).setAngle(0)});
    scene.time.delayedCall(190,()=>{if(expression===heroExpressionGeneration)hero.setTexture("panda-ranger").setPosition(originalX,originalY).setAngle(0);});
  };

  const burst=(x:number,y:number,color=0xf6c453)=>{
    const flash=scene.add.circle(x,y,15,0xffffff,.94).setDepth(31);
    const ring=scene.add.circle(x,y,13,color,0).setStrokeStyle(4,color,.96).setDepth(29);
    scene.tweens.add({targets:flash,scale:2.2,alpha:0,duration:150,ease:"Quad.easeOut",onComplete:()=>flash.destroy()});
    scene.tweens.add({targets:ring,scale:3.6,alpha:0,duration:360,ease:"Quad.easeOut",onComplete:()=>ring.destroy()});
    for(let i=0;i<18;i++){
      const dot=scene.add.circle(x,y,i%3===0?4.4:2.4,i%4===0?0xe0f2fe:color,.98).setDepth(30);const angle=Math.PI*2*i/18;const distance=38+(i%5)*12;
      scene.tweens.add({targets:dot,x:x+Math.cos(angle)*distance,y:y+Math.sin(angle)*distance,alpha:0,scale:.16,duration:390,ease:"Quad.easeOut",onComplete:()=>dot.destroy()});
    }
  };

  const throwProjectile=(x:number,y:number,onImpact?:()=>void)=>{
    const expression=++heroExpressionGeneration;
    const originalX=hero.x,originalY=hero.y,originalScaleX=hero.scaleX,originalScaleY=hero.scaleY;
    scene.tweens.killTweensOf(hero);
    hero.setTexture("panda-ranger").clearTint().setAngle(0).setPosition(originalX,originalY).setScale(originalScaleX,originalScaleY);
    const lock=scene.add.circle(x,y,13,0x7dd3fc,0).setStrokeStyle(2,0xbae6fd,.78).setDepth(26);
    scene.tweens.add({targets:lock,scale:1.85,alpha:{from:.82,to:0},duration:260,ease:"Quad.easeOut",onComplete:()=>lock.destroy()});
    scene.tweens.add({
      targets:hero,x:originalX-8,y:originalY+3,angle:4,scaleX:originalScaleX*.97,scaleY:originalScaleY*1.025,duration:115,ease:"Sine.easeIn",
      onComplete:()=>{
        if(expression!==heroExpressionGeneration)return;
        hero.setTexture("panda-ranger-throw").setPosition(originalX,originalY).setAngle(-2).setScale(originalScaleX,originalScaleY);
        const from={x:hero.x+hero.displayWidth*.39,y:hero.y-hero.displayHeight*.34};
        const distance=Phaser.Math.Distance.Between(from.x,from.y,x,y);
        const arc=Math.min(92,Math.max(34,distance*.14));
        const duration=Phaser.Math.Clamp(250+distance*.13,300,450);
        const flight={progress:0};
        let nextTrail=.04;
        const star=scene.add.graphics().setDepth(28).setPosition(from.x,from.y);
        star.lineStyle(3,0xe0f2fe,.96);star.fillStyle(0xf6c453,1);
        star.fillTriangle(0,-16,5,-4,-5,-4);star.fillTriangle(16,0,4,5,4,-5);star.fillTriangle(0,16,-5,4,5,4);star.fillTriangle(-16,0,-4,-5,-4,5);
        star.fillStyle(0x102038,1);star.fillCircle(0,0,4.5);
        scene.tweens.add({
          targets:flight,progress:1,duration,ease:"Cubic.easeInOut",
          onUpdate:()=>{
            const progress=flight.progress;
            const currentX=Phaser.Math.Linear(from.x,x,progress);
            const currentY=Phaser.Math.Linear(from.y,y,progress)-Math.sin(progress*Math.PI)*arc;
            star.setPosition(currentX,currentY).setRotation(progress*Math.PI*8);
            if(progress<nextTrail)return;
            nextTrail+=.095;
            const trail=scene.add.circle(currentX,currentY,Math.max(2.2,6-progress*3.4),progress<.55?0xf6c453:0x7dd3fc,.82).setDepth(27);
            scene.tweens.add({targets:trail,scale:.2,alpha:0,duration:210,ease:"Quad.easeOut",onComplete:()=>trail.destroy()});
          },
          onComplete:()=>{
            star.destroy();
            const slashA=scene.add.rectangle(x,y,82,4,0xe0f2fe,.96).setRotation(-.48).setDepth(32);
            const slashB=scene.add.rectangle(x,y,58,3,0xf6c453,.9).setRotation(.48).setDepth(32);
            scene.tweens.add({targets:[slashA,slashB],scaleX:1.45,alpha:0,duration:230,ease:"Quad.easeOut",onComplete:()=>{slashA.destroy();slashB.destroy();}});
            burst(x,y);
            onImpact?.();
            if(expression!==heroExpressionGeneration)return;
            scene.time.delayedCall(260,()=>{if(expression===heroExpressionGeneration)hero.setTexture("panda-ranger").setPosition(originalX,originalY).setAngle(0);});
          }
        });
      }
    });
  };

  const reactWrong=()=>{
    const expression=++heroExpressionGeneration;
    const originalX=hero.x,originalY=hero.y;
    scene.tweens.killTweensOf(hero);hero.setTexture("panda-ranger-hurt").setTint(0xffe4e7).setPosition(originalX,originalY).setAngle(0);
    scene.tweens.add({targets:hero,x:originalX-8,angle:-3,duration:55,yoyo:true,repeat:2,onComplete:()=>{hero.setPosition(originalX,originalY).setAngle(0);hero.clearTint();}});
    scene.time.delayedCall(560,()=>{if(expression===heroExpressionGeneration)hero.setTexture("panda-ranger").clearTint().setPosition(originalX,originalY).setAngle(0);});
    const flash=scene.add.rectangle(scene.scale.width/2,scene.scale.height/2,scene.scale.width,scene.scale.height,0xe33f50,.11).setDepth(40);
    scene.tweens.add({targets:flash,alpha:0,duration:260,onComplete:()=>flash.destroy()});
  };
  const celebrate=()=>{
    const expression=++heroExpressionGeneration;
    const originalY=hero.y,originalScaleX=hero.scaleX,originalScaleY=hero.scaleY;
    scene.tweens.killTweensOf(hero);hero.setTexture("panda-ranger-happy").clearTint().setAngle(0);
    const halo=scene.add.circle(hero.x,hero.y-hero.displayHeight*.42,hero.displayWidth*.3,0xf6c453,.16).setStrokeStyle(3,0xfde68a,.7).setDepth(2);
    scene.tweens.add({targets:halo,scale:1.5,alpha:0,duration:420,ease:"Quad.easeOut",onComplete:()=>halo.destroy()});
    scene.tweens.add({targets:hero,y:originalY-11,scaleX:originalScaleX*1.035,scaleY:originalScaleY*1.035,duration:125,yoyo:true,repeat:1,ease:"Sine.easeOut",onComplete:()=>hero.setPosition(hero.x,originalY).setScale(originalScaleX,originalScaleY)});
    scene.time.delayedCall(620,()=>{if(expression===heroExpressionGeneration)hero.setTexture("panda-ranger").setPosition(hero.x,originalY).setScale(originalScaleX,originalScaleY);});
  };

  const collectPowerUp=(kind:PowerUpId,x:number,y:number)=>{
    const palette=kind==="heart"?0xfb7185:kind==="shield"?0x60a5fa:0x67e8f9;
    const glyph=kind==="heart"?"♥":kind==="shield"?"◆":"Ⅱ";
    const orb=scene.add.circle(x,y,20,palette,.95).setStrokeStyle(3,0xffffff,.85).setDepth(34);
    const text=scene.add.text(x,y,glyph,{fontFamily:"system-ui,sans-serif",fontSize:"18px",fontStyle:"800",color:"#08111f"}).setOrigin(.5).setDepth(35);
    const tx=scene.scale.width*.72,ty=Math.max(68,scene.scale.height*.105);
    scene.tweens.add({targets:[orb,text],x:tx,y:ty,scale:.55,duration:520,ease:"Cubic.easeInOut",onComplete:()=>{burst(tx,ty,palette);orb.destroy();text.destroy();}});
  };

  const countdown=(onDone:()=>void)=>{
    const cx=scene.scale.width*.5,cy=Math.max(116,scene.scale.height*.34);
    const plate=scene.add.circle(cx,cy,54,0x08111f,.78).setStrokeStyle(2,0xffffff,.15).setDepth(50);
    const text=scene.add.text(cx,cy,"3",{fontFamily:"system-ui,sans-serif",fontSize:"52px",fontStyle:"900",color:"#ffffff",stroke:"#0f172a",strokeThickness:5}).setOrigin(.5).setDepth(51).setResolution(Math.min(4,Math.max(2,window.devicePixelRatio||1)));
    let step=3;
    const tick=()=>{
      if(step<=0){text.setText("GO!").setFontSize(38).setColor("#a5f3fc");scene.tweens.add({targets:[plate,text],scale:1.22,alpha:0,duration:260,ease:"Back.easeIn",onComplete:()=>{plate.destroy();text.destroy();onDone();}});return;}
      text.setText(String(step)).setScale(.72).setAlpha(.3);
      scene.tweens.add({targets:text,scale:1,alpha:1,duration:130,ease:"Back.easeOut"});
      step-=1;scene.time.delayedCall(330,tick);
    };
    tick();
  };

  return {
    floorY:()=>floor,
    heroPosition:()=>({x:hero.x,y:hero.y}),
    followTarget,typingBeat,throwProjectile,burst,reactWrong,celebrate,collectPowerUp,countdown,reflow:redraw,
    destroy:()=>{heroExpressionGeneration+=1;scene.scale.off("resize",redraw);ambient.forEach((dot)=>dot.destroy());backdrop.destroy();decor.destroy();midground.destroy();foreground.destroy();heroShadow.destroy();hero.destroy();}
  };
}
