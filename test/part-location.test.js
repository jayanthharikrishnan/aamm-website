'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { describePart } = require('../part-location');

test('location guide distinguishes the fixed stator from the rotating rotor', () => {
  const rotor = describePart({category:'Alternator (Dynamo)',subcategory:'Rotor'});
  const stator = describePart({category:'Alternator (Dynamo)',subcategory:'Stator'});
  assert.equal(rotor.supported,true);
  assert.equal(stator.supported,true);
  assert.match(rotor.position.description[0], /turns on the central shaft/);
  assert.match(stator.position.description[0], /stays fixed around the rotor/);
  assert.equal(rotor.assembly,'alternator');
});

test('starter drive and armature have distinct generic assembly locations', () => {
  const drive=describePart({category:'Self Motor',subcategory:'Ben Dex'});
  const armature=describePart({category:'Self Motor',subcategory:'Armature'});
  assert.equal(drive.supported,true);
  assert.equal(armature.supported,true);
  assert.notDeepEqual(drive.position.point,armature.position.point);
  assert.match(drive.position.description[0],/drive nose/);
  assert.match(armature.position.description[0],/central shaft/);
});

test('ambiguous or model-dependent catalogue labels never receive invented placement', () => {
  for (const [category,subcategory] of [
    ['Alternator (Dynamo)','Cut Out (Regulator)'],
    ['Alternator (Dynamo)','Fan'],
    ['Alternator (Dynamo)','Dyad'],
    ['Alternator (Dynamo)','Plate'],
    ['Alternator (Dynamo)','Oil Seal'],
    ['Self Motor','Center Plate'],
    ['Self Motor','Copper Bolt'],
    ['Self Motor','Kataro'],
    ['Self Motor','Spindle'],
    ['Self Motor','Wiper Brush Rocker'],
    ['Unverified new assembly','Rotor'],
    ['Self Motor','Rotor'],
    ['Alternator (Dynamo)','Armature'],
  ]) {
    const guide=describePart({category,subcategory});
    assert.equal(guide.supported,false,`${category}/${subcategory} must not invent a position`);
    assert.equal(guide.position,null);
  }
});

test('bush location remains broad because the catalogue does not specify an end', () => {
  const guide=describePart({category:'Self Motor',subcategory:'Bush'});
  assert.equal(guide.supported,true);
  assert.match(guide.position.description[0],/Both support regions/);
  assert.match(guide.position.description[0],/correct end depends/);
});

test('every supported description is bilingual and uses generic rather than vehicle fitment data', () => {
  for(const [category,subcategory] of [
    ['Alternator (Dynamo)','Rotor'],['Alternator (Dynamo)','Stator'],['Alternator (Dynamo)','Housing'],['Alternator (Dynamo)','Pulley'],['Alternator (Dynamo)','Brush'],['Alternator (Dynamo)','Brush Holder'],
    ['Self Motor','Armature'],['Self Motor','Coil'],['Self Motor','Self Brush'],['Self Motor','Ben Dex'],['Self Motor','Solenoid Switch'],['Self Motor','Fork and Bolt'],['Self Motor','Bush']
  ]) {
    const guide=describePart({category,subcategory,vehicle:'Unverified Vehicle'});
    assert.equal(guide.supported,true);
    assert.equal(guide.position.label.length,2);
    assert.equal(guide.position.description.length,2);
    assert.match(guide.position.description[1],/[\u0B80-\u0BFF]/);
    assert.ok(!guide.position.description.join(' ').includes('Unverified Vehicle'));
  }
});
