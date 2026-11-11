import test from 'node:test';
import assert from 'node:assert/strict';
import {fitMapScale,zoomMapAt,mapPoint,resetMapView,hitMapShape,MIN_MAP_ZOOM,MAX_MAP_ZOOM} from '../../client/src/utils/mapViewport.js';
import {validateOverlay} from '../../shared/mapOverlay.js';
import {annotationMarkup} from '../../client/src/utils/mapAnnotations.js';
import {projectMapDocument} from '../../client/src/utils/printProjectMap.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);
test('image coordinate round trips remain stable at desktop, tablet and narrow mobile canvas sizes',()=>{
 for(const [width,height,left,top,mapHeight]of [[1600,900,200,80,500],[900,600,60,100,1500],[320,300,58,160,500],[140,180,150,150,1000]])for(const zoom of [.2,1,2,12]){
 const rect={width,height,left,top},fit=fitMapScale(width,height,mapHeight),view={zoom,x:83,y:-41},original={x:217.35,y:mapHeight*.61},client={x:left+width/2+view.x+(original.x-500)*fit*zoom,y:top+height/2+view.y+(original.y-mapHeight/2)*fit*zoom},actual=mapPoint(client,rect,view,fit,mapHeight);close(actual.x,original.x);close(actual.y,original.y);
 }
});
test('wheel zoom keeps the exact map point under the pointer and clamps magnification',()=>{
 const rect={left:100,top:70,width:800,height:600},fit=fitMapScale(800,600,500),view={zoom:1,x:40,y:-20},client={x:610,y:260},anchor={x:client.x-rect.left-rect.width/2,y:client.y-rect.top-rect.height/2},before=mapPoint(client,rect,view,fit,500),after=mapPoint(client,rect,zoomMapAt(view,2.7,anchor),fit,500);close(before.x,after.x);close(before.y,after.y);assert.equal(zoomMapAt(view,999).zoom,MAX_MAP_ZOOM);assert.equal(zoomMapAt(view,.0001).zoom,MIN_MAP_ZOOM);
});
test('panning changes only the view; pointer movement maps to a proportional annotation move at each zoom',()=>{
 const rect={left:0,top:0,width:800,height:600},fit=fitMapScale(800,600,500);for(const zoom of [.5,1,4]){const view={zoom,x:0,y:0},a=mapPoint({x:400,y:300},rect,view,fit,500),b=mapPoint({x:450,y:330},rect,view,fit,500);close(b.x-a.x,50/(fit*zoom));close(b.y-a.y,30/(fit*zoom));const panned={...view,x:50,y:30};close(mapPoint({x:450,y:330},rect,panned,fit,500).x,a.x)}assert.deepEqual(resetMapView(),{zoom:1,x:0,y:0});
});
test('rotated sticker hit testing remains in original map coordinates',()=>{
 const shape={x:100,y:100,w:200,h:40,rotation:90};assert.equal(hitMapShape({x:200,y:30},shape,0),true);assert.equal(hitMapShape({x:105,y:110},shape,0),false);
});
test('opacity survives save/reopen and printing, with legacy highlight appearance preserved',()=>{
 const base={id:'shape',type:'rect',x:10,y:10,w:100,h:50,fill:'#ffff00',stroke:'#000000'},saved=validateOverlay([{...base,opacity:.6}]);assert.equal(saved[0].opacity,.6);assert.match(annotationMarkup(JSON.parse(JSON.stringify(saved))),/opacity="0.6"/);assert.equal(validateOverlay([{...base,type:'highlight'}])[0].opacity,.35);assert.match(annotationMarkup([{...base,type:'highlight'}]),/opacity="0.35"/);assert.throws(()=>validateOverlay([{...base,opacity:1.2}]));assert.throws(()=>validateOverlay([{...base,opacity:-.1}]));
 const html=projectMapDocument({image:'data:image/png;base64,AAAA',width:2000,height:1000,annotations:saved});assert.match(html,/viewBox="0 0 1000 500"/);assert.match(html,/opacity="0.6"/);
});
test('unsaved detection ignores inventory display metadata and normalized legacy defaults',async()=>{const {overlayDraftKey}=await import('../../shared/mapOverlay.js'),shape={id:'legacy',type:'highlight',x:10,y:10,w:100,h:50,fill:'#ffff00',stroke:'#000000'};assert.equal(overlayDraftKey([shape]),overlayDraftKey([{...shape,rotation:0,opacity:.35,fontSize:24,strokeWidth:3,align:'start',text:'',layer:'annotations',linkedProperty:{status:'SOLD'}}]));assert.notEqual(overlayDraftKey([shape]),overlayDraftKey([{...shape,x:11}]))});
test('resizing a rotated sticker keeps its opposite corner fixed and follows the pointer',async()=>{const {resizeMapShape}=await import('../../client/src/utils/mapViewport.js');const corner=(s,right,bottom)=>{const a=s.rotation*Math.PI/180,dx=(right?1:-1)*s.w/2,dy=(bottom?1:-1)*s.h/2;return {x:s.x+s.w/2+dx*Math.cos(a)-dy*Math.sin(a),y:s.y+s.h/2+dx*Math.sin(a)+dy*Math.cos(a)}};for(const rotation of [0,30,90,-45]){const shape={x:100,y:100,w:180,h:50,rotation},anchor=corner(shape,false,false),a=rotation*Math.PI/180,pointer={x:anchor.x+240*Math.cos(a)-80*Math.sin(a),y:anchor.y+240*Math.sin(a)+80*Math.cos(a)},resized=resizeMapShape(shape,pointer);close(resized.w,240);close(resized.h,80);close(corner(resized,false,false).x,anchor.x);close(corner(resized,false,false).y,anchor.y);close(corner(resized,true,true).x,pointer.x);close(corner(resized,true,true).y,pointer.y)}});
