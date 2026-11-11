export const MAP_WIDTH=1000;
export const MIN_MAP_ZOOM=.2,MAX_MAP_ZOOM=12;
export const resetMapView=()=>({zoom:1,x:0,y:0});
export function fitMapScale(width,height,mapHeight,padding=24){return Math.max(.00001,Math.min(Math.max(1,width-padding*2)/MAP_WIDTH,Math.max(1,height-padding*2)/mapHeight))}
export function zoomMapAt(view,factor,anchor={x:0,y:0}){const zoom=Math.max(MIN_MAP_ZOOM,Math.min(MAX_MAP_ZOOM,view.zoom*factor)),ratio=zoom/view.zoom;return {zoom,x:anchor.x-(anchor.x-view.x)*ratio,y:anchor.y-(anchor.y-view.y)*ratio}}
export function mapPoint(client,rect,view,fitScale,mapHeight){const scale=fitScale*view.zoom;return {x:(client.x-rect.left-rect.width/2-view.x)/scale+MAP_WIDTH/2,y:(client.y-rect.top-rect.height/2-view.y)/scale+mapHeight/2}}
export function unrotateMapPoint(point,shape){const a=-(shape.rotation||0)*Math.PI/180,cx=shape.x+shape.w/2,cy=shape.y+shape.h/2;return {x:cx+(point.x-cx)*Math.cos(a)-(point.y-cy)*Math.sin(a),y:cy+(point.x-cx)*Math.sin(a)+(point.y-cy)*Math.cos(a)}}
export function hitMapShape(point,shape,tolerance=5){const p=unrotateMapPoint(point,shape);return p.x>=shape.x-tolerance&&p.x<=shape.x+shape.w+tolerance&&p.y>=shape.y-tolerance&&p.y<=shape.y+shape.h+tolerance}
// Resize in the shape's local axes while fixing its rotated top-left corner.
export function resizeMapShape(shape,point,minSize=5){const a=(shape.rotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cx=shape.x+shape.w/2,cy=shape.y+shape.h/2,anchor={x:cx-shape.w*c/2+shape.h*s/2,y:cy-shape.w*s/2-shape.h*c/2},dx=point.x-anchor.x,dy=point.y-anchor.y,w=Math.max(minSize,dx*c+dy*s),h=Math.max(minSize,-dx*s+dy*c),center={x:anchor.x+w*c/2-h*s/2,y:anchor.y+w*s/2+h*c/2};return {...shape,x:center.x-w/2,y:center.y-h/2,w,h}}
