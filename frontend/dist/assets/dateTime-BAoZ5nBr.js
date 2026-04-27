import{c}from"./index-SoTj7lXA.js";/**
 * @license lucide-react v0.390.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=c("LoaderCircle",[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]]);function o(t){if(!t)return null;const e=/[Z+\-]\d*$/.test(t.trim())?t:t+"Z",n=new Date(e);return isNaN(n.getTime())?null:n}function f(t){const e=o(t);return e?e.toLocaleString(void 0,{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function l(t){const e=o(t);return e?e.toLocaleTimeString(void 0,{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function g(t,e){const n=o(t);if(!n)return"—";const a=(o(e)??new Date).getTime()-n.getTime();if(a<0||a<1e3)return"<1s";const r=Math.floor(a/1e3);if(r<60)return`${r}s`;const i=Math.floor(r/60);return i<60?`${i}m ${r%60}s`:`${Math.floor(i/60)}h ${i%60}m`}export{m as L,l as a,g as e,f};
