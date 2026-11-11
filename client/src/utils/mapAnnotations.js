const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>Number.isFinite(Number(v))?Number(v):0;
const color=v=>/^#[0-9a-f]{6}$/i.test(v||'')?v:'none';
export function annotationMarkup(shapes=[]){
 return shapes.map(s=>{const x=number(s.x),y=number(s.y),w=Math.max(1,number(s.w)),h=Math.max(1,number(s.h)),stroke=color(s.stroke),fill=color(s.fill),sw=Math.max(1,number(s.strokeWidth)),common=`stroke="${stroke}" fill="${fill}" stroke-width="${sw}"`;
 let body='';
 if(s.type==='text'){const size=Math.max(8,Math.min(150,number(s.fontSize))),anchor=['start','middle','end'].includes(s.align)?s.align:'start',tx=anchor==='middle'?w/2:anchor==='end'?w:0;body=`<text x="${tx}" y="${size}" fill="${stroke}" font-family="Arial,sans-serif" font-size="${size}" text-anchor="${anchor}">${String(s.text||'').slice(0,4000).split('\n').map((line,i)=>`<tspan x="${tx}" dy="${i?size*1.2:0}">${escape(line)}</tspan>`).join('')}</text>`}
 else if(s.type==='rect'||s.type==='highlight')body=`<rect width="${w}" height="${h}" ${common} ${s.type==='highlight'?'opacity="0.35"':''}/>`;
 else if(s.type==='circle')body=`<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}" ${common}/>`;
 else if(['line','arrow','draw'].includes(s.type)){const points=(s.points||[]).map(p=>`${number(p[0])*w},${number(p[1])*h}`).join(' ');body=`<polyline points="${points}" stroke="${stroke}" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;if(s.type==='arrow'&&s.points?.length>1){const a=s.points[0],b=s.points.at(-1),angle=Math.atan2((b[1]-a[1])*h,(b[0]-a[0])*w),len=Math.max(12,sw*4),bx=b[0]*w,by=b[1]*h;body+=`<path d="M ${bx-len*Math.cos(angle-.5)} ${by-len*Math.sin(angle-.5)} L ${bx} ${by} L ${bx-len*Math.cos(angle+.5)} ${by-len*Math.sin(angle+.5)}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`}}
 return `<g transform="translate(${x} ${y})">${body}</g>`;
 }).join('');
}
export function mapAnnotationOverlay(shapes,width,height){return `<svg x="0" y="0" width="${width}" height="${height}" viewBox="0 0 1000 ${1000*height/width}">${annotationMarkup(shapes)}</svg>`}
