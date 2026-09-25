import { renderHTML } from './document/render';
import type { PDFOptions } from './settings';
import 'katex/dist/katex.min.css';
import './print.css';
declare global { interface Window { printDocument:(text:string,options:PDFOptions,images:Record<string,string>)=>Promise<void> } }
window.printDocument=async(text,options,images)=>{
  document.documentElement.dataset.theme=options.theme;
  document.title=options.title;
  const dimensions=options.pageSize==='A5'?[148,210]:options.pageSize==='Letter'?[215.9,279.4]:[210,297];
  if(options.landscape)dimensions.reverse();
  document.body.style.width=`${dimensions[0]-2*options.margin}mm`;
  document.documentElement.style.setProperty('--image-height',`${dimensions[1]-2*Math.max(options.margin,18)-25}mm`);
  const content=document.getElementById('print-content')!;
  content.innerHTML=renderHTML(text,true,{images,pdf:true});
  if(options.titleBlock){const header=document.createElement('header');header.className='document-cover';const title=document.createElement('h1');title.textContent=options.title;const byline=document.createElement('p');byline.textContent=[options.author,options.date].filter(Boolean).join(' · ');header.append(title,byline);content.prepend(header)}
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map(image=>image.decode().catch(()=>{throw new Error('图片解码失败，请检查图片文件。')})));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  for(const formula of Array.from(content.querySelectorAll<HTMLElement>('.katex-display'))){
    const inner=formula.querySelector<HTMLElement>('.katex-html');
    if(inner&&inner.scrollWidth>content.clientWidth){const size=parseFloat(getComputedStyle(formula).fontSize);formula.style.fontSize=`${size*content.clientWidth/inner.scrollWidth}px`}
  }
};
