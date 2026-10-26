// SPDX-License-Identifier: MPL-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {beginSwipe,moveSwipe,endSwipe} from '../source/swipe.js';

test('horizontal swipe follows the finger and flicks toward later cartridges',()=>{
  const g=beginSwipe(300,200,0,1,100);
  const move=moveSwipe(g,230,202,.1,10);
  assert.equal(move.axis,'horizontal');assert.equal(move.scroll,1.7);assert.equal(move.selected,2);
  const release=endSwipe(g,230,202,.12,10);
  assert.equal(release.selected,2);assert.equal(release.tap,false);
});
test('edges, long libraries and stationary release remain bounded',()=>{
  const first=beginSwipe(200,200,0,0,100);
  assert.equal(moveSwipe(first,800,200,.1,4).scroll,0);
  assert.equal(endSwipe(first,800,200,.12,4).selected,0);
  const last=beginSwipe(200,200,0,3,100);
  assert.equal(endSwipe(last,-800,200,.1,4).selected,3);
  const long=beginSwipe(200,200,0,20,100);moveSwipe(long,40,200,.1,100);
  assert.equal(endSwipe(long,40,200,.3,100).selected,22);
});
test('tap, vertical drag and cancellation do not become a launch or stale fling',()=>{
  const tap=beginSwipe(20,20,0,1,100);
  assert.equal(endSwipe(tap,24,22,.1,3).tap,true);
  const vertical=beginSwipe(20,20,0,1,100);moveSwipe(vertical,23,60,.1,3);
  assert.equal(endSwipe(vertical,70,100,.2,3).axis,'vertical');
  assert.equal(endSwipe(vertical,70,100,.2,3).tap,false);
  const cancelled=beginSwipe(200,200,0,1,100);moveSwipe(cancelled,100,200,.1,20);
  assert.equal(endSwipe(cancelled,100,200,.11,20,true).selected,2);
  assert.equal(endSwipe(cancelled,100,200,.11,20,false,true).selected,2);
  assert.equal(endSwipe(beginSwipe(20,20,0,0,100),-100,20,.1,0).selected,0);
});
