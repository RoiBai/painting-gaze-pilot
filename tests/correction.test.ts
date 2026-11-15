import {describe,it,expect} from 'vitest';
import {buildCorrectionPlan,applyCorrection} from '../src/correction';
import {correctionExportFixture} from './correctionExportFixture';
import {mapPoint} from '../src/geometry';

describe('per-trial reference drift translation, never a replacement for raw data',()=>{
  it('uses the latest preceding drift, not a different validation fit, and retains quality',()=>{
    const raw=correctionExportFixture(),before=JSON.stringify(raw);
    const plan=buildCorrectionPlan(raw),result=applyCorrection(raw,plan);
    expect(plan.models[0]).toMatchObject({status:'available',runId:'fixture-drift',offsetX:-50,offsetY:10,beforeMedianErrorPx:Math.hypot(50,10),afterMedianErrorPx:0});
    expect(result.session.samples[0]).toMatchObject({viewportX:300,viewportY:400,imageNormX:.25,imageNormY:.5});
    expect(result.rows[0]).toMatchObject({rawViewportX:350,correctedViewportX:300,correctionApplied:true});
    expect(result.session.coordinateSource).toBe('reference-corrected');
    expect(result.session.quality).toBe('low_quality');
    expect(JSON.stringify(raw)).toBe(before);
  });
  it('gives targets equal weight instead of allowing a high-rate target to dominate',()=>{
    const raw=correctionExportFixture();
    const source=raw.validation.find(r=>r.runId==='fixture-drift'&&r.targetId==='0')!;
    raw.validation.push(...Array.from({length:100},()=>({...source,predictionX:source.targetX+90})));
    expect(buildCorrectionPlan(raw).models[0].offsetX).toBe(-50);
  });
  it('preserves null and out-of-image coordinates without clamping',()=>{
    const raw=correctionExportFixture();
    raw.samples[2]={...raw.samples[2],viewportX:1220,viewportY:390,...mapPoint(1220,390,raw.geometries[0])};
    raw.samples[3]={...raw.samples[3],viewportX:20,viewportY:390,...mapPoint(20,390,raw.geometries[0])};
    const result=applyCorrection(raw);
    expect(result.rows[1]).toMatchObject({correctionApplied:false,correctedViewportX:null,correctedImageNormX:null});
    expect(result.session.samples[2]).toMatchObject({viewportX:1170,insideImage:true});
    expect(result.session.samples[3]).toMatchObject({viewportX:-30,imageNormX:-.025,insideImage:false});
  });
  it('never uses a future drift or an unrelated calibration version',()=>{
    const raw=correctionExportFixture();
    raw.validation=raw.validation.map(r=>r.kind==='drift'?{...r,timeMs:r.timeMs+20000}:r);
    expect(buildCorrectionPlan(raw).available).toBe(false);
    const other=correctionExportFixture();other.samples=other.samples.map(r=>({...r,calibrationVersion:2}));
    expect(buildCorrectionPlan(other).available).toBe(false);
  });
  it('does not fall back to an older run when the latest is incomplete or uses another viewport',()=>{
    const raw=correctionExportFixture();
    const prior=raw.validation.filter(r=>r.kind==='drift').map(r=>({...r,runId:'older',timeMs:r.timeMs-1000}));
    raw.validation.push(...prior);raw.validationSummaries.unshift({...raw.validationSummaries[1],runId:'older'});
    raw.validation=raw.validation.filter(r=>!(r.runId==='fixture-drift'&&r.targetId==='2'));
    expect(buildCorrectionPlan(raw).models[0]).toMatchObject({status:'unavailable',runId:'fixture-drift'});
    const other=correctionExportFixture();other.validation=other.validation.map(r=>r.kind==='drift'?{...r,viewportWidth:1000}:r);
    expect(buildCorrectionPlan(other).models[0].reason).toContain('视口尺寸');
  });
  it('cannot mix uncorrected trials into the corrected display',()=>{
    const raw=correctionExportFixture();raw.samples[3].trialId='missing';
    const result=applyCorrection(raw);
    expect(result.session.samples[3]).toMatchObject({predictionAvailable:false,viewportX:null,insideImage:false});
    expect(result.rows[3].correctionApplied).toBe(false);
    expect(raw.samples[3].viewportX).toBe(950);
  });
  it('rejects mixed geometry and very large shifts',()=>{
    const raw=correctionExportFixture();raw.samples[3].geometryVersion=2;
    expect(buildCorrectionPlan(raw).models[0].status).toBe('unavailable');
    const other=correctionExportFixture();other.validation=other.validation.map(r=>r.kind==='drift'?{...r,predictionX:r.targetX+1000}:r);
    expect(buildCorrectionPlan(other).models[0].reason).toContain('25%');
  });
});
