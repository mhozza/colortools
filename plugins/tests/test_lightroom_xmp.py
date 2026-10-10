"""Unit tests for Lightroom Camera Raw HSL mapping and non-destructive XMP generation."""
from pathlib import Path
import defusedxml.minidom as minidom
import xml.etree.ElementTree as ET
import pytest

from ports.plugin import SpokeDirective
from lightroom_xmp.camera_raw import (
    CAMERA_RAW_HUE_CHANNELS,
    find_nearest_channel,
    map_hue_delta_to_slider,
)
from lightroom_xmp.generator import (
    XMP_NAMESPACES,
    XmpSidecarWriter,
    build_camera_raw_adjustments,
    generate_xmp_document,
)
from lightroom_xmp.plugin import LightroomXmpPlugin


def test_camera_raw_hue_channels_count():
    """Verify Adobe Camera Raw defines exactly the 8 standard HSL color channels."""
    assert len(CAMERA_RAW_HUE_CHANNELS) == 8
    tags = [ch.xmp_tag for ch in CAMERA_RAW_HUE_CHANNELS]
    assert "crs:HueAdjustmentRed" in tags
    assert "crs:HueAdjustmentOrange" in tags
    assert "crs:HueAdjustmentYellow" in tags
    assert "crs:HueAdjustmentGreen" in tags
    assert "crs:HueAdjustmentAqua" in tags
    assert "crs:HueAdjustmentBlue" in tags
    assert "crs:HueAdjustmentPurple" in tags
    assert "crs:HueAdjustmentMagenta" in tags


def test_channel_mapping_and_slider_scaling():
    """Verify hue angles map to the nearest channel and clamp correctly."""
    # Red around 0° / 355°
    red_ch = find_nearest_channel(0.0)
    assert red_ch.name == "Red"
    assert red_ch.xmp_tag == "crs:HueAdjustmentRed"

    # Aqua around 180°
    aqua_ch = find_nearest_channel(185.0)
    assert aqua_ch.name == "Aqua"

    # Blue around 240°
    blue_ch = find_nearest_channel(235.0)
    assert blue_ch.name == "Blue"

    # Slider scaling: ±30 degrees maps to ±100
    assert map_hue_delta_to_slider(0.0) == 0
    assert map_hue_delta_to_slider(15.0) == 50
    assert map_hue_delta_to_slider(-15.0) == -50
    assert map_hue_delta_to_slider(30.0) == 100
    assert map_hue_delta_to_slider(60.0) == 100  # Clamped
    assert map_hue_delta_to_slider(-60.0) == -100  # Clamped


def test_build_camera_raw_adjustments_from_directives():
    """Test generating adjustment dict from SpokeDirectives."""
    directives = [
        SpokeDirective(
            sample_id="1",
            sample_name="Skin",
            current_hue=30.0,
            target_hue=20.0,
            delta_degrees=-10.0,
            target_color_name="Orange",
            instruction="Shift -10 toward Orange",
        ),
        SpokeDirective(
            sample_id="2",
            sample_name="Sky",
            current_hue=240.0,
            target_hue=250.0,
            delta_degrees=10.0,
            target_color_name="Blue",
            instruction="Shift +10 toward Blue",
        ),
    ]

    adj = build_camera_raw_adjustments(directives)
    assert "crs:HueAdjustmentOrange" in adj
    assert "crs:HueAdjustmentBlue" in adj
    assert adj["crs:HueAdjustmentOrange"] < 0
    assert adj["crs:HueAdjustmentBlue"] > 0
    # Untouched channels should be 0
    assert adj["crs:HueAdjustmentGreen"] == 0


def test_xmp_document_valid_xml_and_namespaces():
    """Generated .xmp files are valid XML and contain valid Adobe Camera Raw namespace definitions."""
    adjustments = {
        "crs:HueAdjustmentRed": 12,
        "crs:HueAdjustmentOrange": -20,
        "crs:HueAdjustmentBlue": 35,
    }

    xmp_str = generate_xmp_document(adjustments)

    # Must be parseable XML
    dom = minidom.parseString(xmp_str)
    assert dom is not None

    # Check root element and namespaces
    root = ET.fromstring(xmp_str)
    assert "adobe:ns:meta/" in root.tag

    # Confirm crs namespace is present in string
    assert 'xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"' in xmp_str
    assert 'crs:HueAdjustmentRed="12"' in xmp_str
    assert 'crs:HueAdjustmentOrange="-20"' in xmp_str
    assert 'crs:HueAdjustmentBlue="35"' in xmp_str


def test_non_destructive_sidecar_writing(tmp_path: Path):
    """Writing XMP sidecar must never modify or touch the raw image file."""
    # Create fake RAW file
    fake_raw = tmp_path / "DSC01234.ARW"
    raw_content = b"\x00\x01\x02\x03RAW_DATA_STUB"
    fake_raw.write_bytes(raw_content)

    sidecar_path = XmpSidecarWriter.write_sidecar(
        fake_raw,
        {"crs:HueAdjustmentRed": 10, "crs:HueAdjustmentBlue": -15},
    )

    # Sidecar file created with .xmp extension
    assert sidecar_path.exists()
    assert sidecar_path.name == "DSC01234.xmp"
    assert sidecar_path.parent == tmp_path

    # Original RAW file content remains completely untouched
    assert fake_raw.read_bytes() == raw_content

    # Sidecar is valid XML
    parsed_xml = ET.fromstring(sidecar_path.read_text(encoding="utf-8"))
    assert parsed_xml is not None


def test_lightroom_xmp_plugin_port_and_writer(tmp_path: Path):
    """Test LightroomXmpPlugin adheres to PluginPort and PresetWriterPort."""
    plugin = LightroomXmpPlugin()
    assert plugin.name == "lightroom_xmp"
    plugin.initialize()

    fake_raw = tmp_path / "IMG_9999.CR3"
    fake_raw.write_bytes(b"CR3_FAKE_PAYLOAD")

    directives = [
        SpokeDirective(
            sample_id="1",
            sample_name="Leaf",
            current_hue=120.0,
            target_hue=130.0,
            delta_degrees=10.0,
            target_color_name="Green",
            instruction="Shift",
        )
    ]

    out_sidecar = plugin.export_from_directives(fake_raw, directives)
    assert out_sidecar.exists()
    assert out_sidecar.name == "IMG_9999.xmp"
    content = out_sidecar.read_text(encoding="utf-8")
    assert "crs:HueAdjustmentGreen" in content
    assert fake_raw.read_bytes() == b"CR3_FAKE_PAYLOAD"
