import{r as i,j as e,g as c}from"./index-BTYsBeGM.js";function b({message:r="Loading…",size:s="md"}){const[o,n]=i.useState(!1);i.useEffect(()=>{const a=setTimeout(()=>n(!0),20);return()=>clearTimeout(a)},[]);const t=s==="sm"?.6:s==="lg"?1.3:1;return e.jsxs(e.Fragment,{children:[e.jsx("style",{children:`
        @keyframes l3d-breathe {
          0%, 100% { transform: perspective(600px) rotateX(8deg) rotateY(-6deg) translateZ(0px); }
          33%       { transform: perspective(600px) rotateX(-4deg) rotateY(8deg) translateZ(6px); }
          66%       { transform: perspective(600px) rotateX(6deg) rotateY(-3deg) translateZ(3px); }
        }
        @keyframes l3d-pulse {
          0%   { transform: scale(1);   opacity: 0.7; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes l3d-orbit-slow {
          from { transform: rotateZ(0deg); }
          to   { transform: rotateZ(360deg); }
        }
        @keyframes l3d-orbit-counter {
          from { transform: rotateZ(0deg); }
          to   { transform: rotateZ(-360deg); }
        }
        @keyframes l3d-shimmer {
          0%   { transform: translateX(-120%) skewX(-12deg); opacity: 0; }
          30%  { opacity: 0.6; }
          100% { transform: translateX(220%) skewX(-12deg); opacity: 0; }
        }
        @keyframes l3d-dot-bounce {
          0%, 80%, 100% { transform: translateY(0);    opacity: 0.4; }
          40%            { transform: translateY(-6px); opacity: 1; }
        }
      `}),e.jsxs("div",{className:"flex flex-col items-center justify-center py-16 gap-6",style:{opacity:o?1:0,transition:"opacity 0.4s ease"},role:"status","aria-label":r,children:[e.jsxs("div",{style:{position:"relative",width:80*t,height:80*t},children:[[0,1].map(a=>e.jsx("div",{style:{position:"absolute",inset:0,borderRadius:"50%",border:"1.5px solid rgba(77,168,160,0.30)",animation:`l3d-pulse 2.4s ease-out ${a*1.2}s infinite`},"aria-hidden":"true"},a)),e.jsx("div",{style:{position:"absolute",inset:-16*t,borderRadius:"50%",border:"1px solid rgba(77,168,160,0.20)",animation:"l3d-orbit-slow 8s linear infinite"},"aria-hidden":"true",children:e.jsx("div",{style:{position:"absolute",top:-3,left:"50%",width:6,height:6,borderRadius:"50%",background:"radial-gradient(circle, #A8E2DD, #4DA8A0)",boxShadow:"0 0 6px #A8E2DD",transform:"translateX(-50%)"}})}),e.jsx("div",{style:{position:"absolute",inset:-8*t,borderRadius:"50%",border:"1px solid rgba(77,168,160,0.25)",animation:"l3d-orbit-counter 6s linear infinite"},"aria-hidden":"true",children:e.jsx("div",{style:{position:"absolute",bottom:-3,right:"25%",width:5,height:5,borderRadius:"50%",background:"radial-gradient(circle, #93CCC6, #4DA8A0)",boxShadow:"0 0 5px #93CCC6"}})}),e.jsxs("div",{style:{position:"absolute",inset:0,borderRadius:18*t,animation:"l3d-breathe 3.2s ease-in-out infinite"},"aria-hidden":"true",children:[[{z:-14,op:.12,blur:4},{z:-8,op:.18,blur:2}].map(({z:a,op:d,blur:l},p)=>e.jsx("div",{style:{position:"absolute",inset:0,borderRadius:18*t,background:"linear-gradient(135deg, #4DA8A0, #6CBDB5)",transform:`translateZ(${a}px)`,opacity:d,filter:`blur(${l}px)`}},p)),e.jsxs("div",{style:{position:"absolute",inset:0,borderRadius:18*t,background:"linear-gradient(145deg, #93CCC6 0%, #358F87 40%, #4DA8A0 100%)",boxShadow:"0 8px 24px rgba(77,168,160,0.45), 0 2px 8px rgba(77,168,160,0.3), inset 0 1px 0 rgba(255,255,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"},children:[e.jsx("div",{style:{position:"absolute",top:0,left:0,right:0,height:"55%",borderRadius:`${18*t}px ${18*t}px 60% 60%`,background:"linear-gradient(180deg, rgba(255,255,255,0.28) 0%, transparent 100%)"}}),e.jsx("div",{style:{position:"absolute",inset:0,background:"linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",animation:"l3d-shimmer 3.2s ease-in-out 0.8s infinite"}}),e.jsx(c,{style:{width:28*t,height:28*t,color:"rgba(255,255,255,0.95)",filter:"drop-shadow(0 2px 4px rgba(0,0,0,0.25))",position:"relative",zIndex:1}})]})]})]}),e.jsxs("div",{className:"flex items-center gap-2 text-slate-500",style:{fontSize:13*t},children:[e.jsx("span",{className:"font-medium text-slate-600",children:r}),e.jsx("span",{className:"flex gap-1","aria-hidden":"true",children:[0,1,2].map(a=>e.jsx("span",{style:{display:"inline-block",width:4,height:4,borderRadius:"50%",background:"#93CCC6",animation:`l3d-dot-bounce 1.1s ease-in-out ${a*.18}s infinite`}},a))})]})]})]})}export{b as L};
