// Fit exceptionally long recorded text above the fixed signature area.
// DOM presentation only: no transaction fields or financial data are changed.
export function fitPayoutPrint(doc){
 if(!doc?.body?.classList.contains('payout-document'))return [];
 return [...doc.querySelectorAll('.copy')].map(copy=>{
  const content=copy.querySelector('.payout-content'),signatures=copy.querySelector('.payout-signatures');if(!content||!signatures)return 1;
  content.style.transformOrigin='top left';content.style.transform='none';content.style.width='100%';
  const available=signatures.offsetTop-content.offsetTop-20;if(available<=0||content.scrollHeight<=available)return 1;
  let low=.5,high=1;for(let i=0;i<14;i++){const scale=(low+high)/2;content.style.width=`${100/scale}%`;if(content.scrollHeight*scale<=available)low=scale;else high=scale}
  const scale=Math.floor(low*1000)/1000;content.style.width=`${100/scale}%`;content.style.transform=`scale(${scale})`;return scale;
 });
}
