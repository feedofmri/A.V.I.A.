import json
from pathlib import Path
import pytest
from test_inference import client, BASELINES, DEEP
from src.engine.registry import Registry

def payload(**changes):
    step=dict(hr_bpm=61,spo2_pct=98,eda_tonic_us=1.9,hrv_rmssd_ms=62,sleep_duration_hr=7.5,**DEEP)
    step.update(changes)
    return {"crew_id":"brandt","crew_code":"C002","baseline":BASELINES["brandt"],"steps":[step]}

def test_critical_oxygen_overrides_nominal_fusion(client):
    result=client.post('/api/v1/infer',json=payload(spo2_pct=80)).json()
    assert result['crew_status_badge']=='Critical'
    assert any(a['kind']=='hypoxia' and a['status']=='critical' for a in result['active_alerts'])

def test_rejected_sleep_channel_cannot_raise_encoder_alert(client):
    result=client.post('/api/v1/infer',json=payload(eog_std_uv=200)).json()
    assert result['modality_mask']['Sleep']==0
    assert 'sleep' not in {a['kind'] for a in result['active_alerts']}

def test_unknown_context_rejected(client):
    body=payload();body['crew_code']='C999'
    assert client.post('/api/v1/infer',json=body).status_code==422
    assert client.post('/api/v1/infer',json=payload(mission_timepoint='R+999')).status_code==422

def test_confidence_and_forecasts_disclose_method(client):
    r=client.post('/api/v1/infer',json=payload()).json()
    assert r['confidence_pct'] is None
    assert 'not calibrated' in r['confidence_note']
    assert r['provenance']['forecast']=='experimental_extrapolation'
    assert all(v['step_hours']==12 for v in r['analytics_forecast_7step'].values())

def test_frozen_bundle_is_deterministic(client):
    a=client.post('/api/v1/infer',json=payload()).json()
    b=client.post('/api/v1/infer',json=payload()).json()
    assert a['fusion_outputs']==b['fusion_outputs']
    assert a['fusion_outputs']['anomaly_score']==pytest.approx(0.1026,abs=0.0001)

def test_critical_bone_status_is_retained(client):
    r=client.post('/api/v1/twin/projection',json={'crew_id':'brandt','femoral_bmd':0.8,'lumbar_bmd':0.95}).json()
    assert r['skeletal_risk_projection']['status']=='Critical'

def test_changed_artifact_fails_closed(tmp_path):
    manifest=json.loads((Path(__file__).resolve().parents[1]/'artifacts/manifest.json').read_text())
    first=next(iter(manifest['files']))
    (tmp_path/first).write_text('changed artifact')
    from src.engine.fusion import FusionVariant
    r=Registry(tmp_path);r.load(FusionVariant())
    assert not r.ready
    assert 'checksum mismatch' in r.error
