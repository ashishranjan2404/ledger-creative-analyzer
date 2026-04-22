from unittest.mock import patch
from spec_lesson.capture.devices import find_blackhole_device, DeviceError

def test_find_blackhole_returns_index_when_present():
    fake_devices = [
        {"name": "Built-in Mic", "max_input_channels": 2},
        {"name": "BlackHole 2ch", "max_input_channels": 2},
        {"name": "External Speakers", "max_input_channels": 0},
    ]
    with patch("sounddevice.query_devices", return_value=fake_devices):
        idx = find_blackhole_device()
        assert idx == 1

def test_find_blackhole_raises_when_missing():
    fake_devices = [
        {"name": "Built-in Mic", "max_input_channels": 2},
    ]
    with patch("sounddevice.query_devices", return_value=fake_devices):
        try:
            find_blackhole_device()
            assert False, "should have raised"
        except DeviceError as e:
            assert "blackhole" in str(e).lower()
            assert "brew install blackhole-2ch" in str(e)
