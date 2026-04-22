class DeviceError(RuntimeError):
    pass

def find_blackhole_device() -> int:
    """Return the sounddevice index of BlackHole 2ch. Raise DeviceError if missing."""
    import sounddevice
    devices = sounddevice.query_devices()
    for idx, dev in enumerate(devices):
        if "blackhole" in dev["name"].lower() and dev["max_input_channels"] > 0:
            return idx
    raise DeviceError(
        "BlackHole 2ch virtual audio device not found. "
        "Install with: brew install blackhole-2ch"
    )
