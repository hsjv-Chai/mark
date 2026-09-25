export function modal(title:string,body:string) {
  const dialog=document.createElement('dialog');dialog.className='panel';
  dialog.innerHTML=`<div class="panel-heading"><h2></h2><button type="button" class="icon-button" aria-label="关闭对话框">×</button></div><div class="panel-body">${body}</div>`;
  dialog.querySelector('h2')!.textContent=title;
  dialog.querySelector('button')!.onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove());
  document.body.append(dialog);dialog.showModal();return dialog;
}
export const escapeHTML=(text:string)=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
