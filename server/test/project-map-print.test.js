import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP_PAPERS,projectMapDocument} from '../../client/src/utils/printProjectMap.js';
const image='data:image/png;base64,iVBORw0KGgo=',base={image,width:1600,height:900,printedAt:'2026-11-09T08:00:00Z',project:{projectName:'Test Project',location:'Davao City'}};
test('all paper sizes and orientations retain full map with correct page dimensions',()=>{
 for(const [paper,size] of Object.entries(MAP_PAPERS))for(const orientation of ['portrait','landscape']){const html=projectMapDocument({...base,paper,orientation});const [w,h]=orientation==='portrait'?[size.width,size.height]:[size.height,size.width];assert.ok(html.includes(`size:${w}mm ${h}mm`));assert.ok(html.includes('viewBox="0 0 1600 900"'));assert.ok(html.includes('preserveAspectRatio="xMidYMid meet"'));assert.equal((html.match(/<section class="sheet">/g)||[]).length,1)}
});
test('map-only omits company and project details; optional headers are escaped and dated in Manila',()=>{
 const project={projectName:'Project <script>alert(1)</script>',location:'Davao & City'},opts={...base,project,companyName:'Company <img>',scope:'Phase 1 / Block 2',title:'Map "Title"'};
 const only=projectMapDocument(opts);assert.ok(!only.includes('<header>'));assert.ok(!only.includes('Company &lt;img&gt;'));
 const details=projectMapDocument({...opts,details:true});assert.ok(details.includes('Company &lt;img&gt;'));assert.ok(details.includes('Project &lt;script&gt;'));assert.ok(details.includes('Phase 1 / Block 2'));assert.ok(details.includes('4:00:00 PM'));assert.ok(!details.includes('<script>'));assert.ok(!details.includes('Client Payment &amp; Property Management System'));
});
test('four-sheet layout covers each quadrant exactly once and labels assembly order',()=>{
 const html=projectMapDocument({...base,layout:'tiles'});assert.equal((html.match(/<section class="sheet">/g)||[]).length,4);for(const view of ['0 0 800 450','800 0 800 450','0 450 800 450','800 450 800 450'])assert.ok(html.includes(`viewBox="${view}"`));assert.ok(html.includes('Map sheet 4 of 4'));assert.ok(!html.includes('window.print'));
});
test('printing rejects unsupported inputs and does not mutate project data',()=>{
 const before=JSON.stringify(base);projectMapDocument({...base,details:true});assert.equal(JSON.stringify(base),before);
 for(const opts of [{image:'javascript:alert(1)'},{image:'https://example.com/map.png'},{width:0},{height:Infinity},{paper:'UNKNOWN'},{orientation:'diagonal'},{layout:'stretch'}])assert.throws(()=>projectMapDocument({...base,...opts}));
});

test('small and extreme wide/tall maps retain every source pixel in fit and tiled layouts',()=>{
 for(const [width,height] of [[1,1],[16000,2500],[2500,16000]])for(const layout of ['fit','tiles']){const html=projectMapDocument({...base,width,height,layout});assert.ok(html.includes(`width="${width}" height="${height}"`));assert.ok(html.includes('preserveAspectRatio="xMidYMid meet"'));assert.equal((html.match(/<section class="sheet">/g)||[]).length,layout==='fit'?1:4)}
});
