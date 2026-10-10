import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HarmonyPanel from '../HarmonyPanel';
import { HarmonyEvaluationResult } from '../../types';

describe('HarmonyPanel Component', () => {
  const mockHarmonies: HarmonyEvaluationResult[] = [
    {
      harmony_name: 'Complementary',
      match_score: 94.2,
      spoke_angles: [30, 210],
      directives: [
        {
          sample_id: 's1',
          sample_name: 'Tower in shadow',
          current_hue: 198,
          target_hue: 210,
          delta_degrees: 12,
          target_color_name: 'Teal',
          instruction: 'Shift sample Tower in shadow +12° toward Teal',
        },
      ],
    },
    {
      harmony_name: 'Triadic',
      match_score: 72.5,
      spoke_angles: [30, 150, 270],
      directives: [],
    },
  ];

  it('renders empty message when no harmonies are present', () => {
    render(<HarmonyPanel harmonies={[]} />);
    expect(screen.getByText(/Sample at least 2 points on the photo/i)).toBeInTheDocument();
  });

  it('renders ranked harmony cards with score badges', () => {
    render(<HarmonyPanel harmonies={mockHarmonies} photoPath="/path/test.CR3" />);

    expect(screen.getByText('Complementary')).toBeInTheDocument();
    expect(screen.getByText('94.2%')).toBeInTheDocument();
    expect(screen.getByText('Top Match')).toBeInTheDocument();
    expect(screen.getByText('Triadic')).toBeInTheDocument();
    expect(screen.getByText('72.5%')).toBeInTheDocument();
  });

  it('triggers onSelectHarmony when clicking a card', () => {
    const onSelect = vi.fn();
    render(
      <HarmonyPanel
        harmonies={mockHarmonies}
        selectedHarmonyName="Complementary"
        onSelectHarmony={onSelect}
      />
    );

    fireEvent.click(screen.getByTestId('harmony-card-Triadic'));
    expect(onSelect).toHaveBeenCalledWith(mockHarmonies[1]);
  });

  it('displays spoke directives for active harmony', () => {
    render(
      <HarmonyPanel
        harmonies={mockHarmonies}
        selectedHarmonyName="Complementary"
        photoPath="/path/test.CR3"
      />
    );

    expect(screen.getByText('Tower in shadow')).toBeInTheDocument();
    expect(screen.getByText('Teal')).toBeInTheDocument();
    expect(screen.getByText('+12.0°')).toBeInTheDocument();
  });

  it('disables export button when photoPath is missing', () => {
    render(<HarmonyPanel harmonies={mockHarmonies} photoPath={null} />);
    const exportBtn = screen.getByTestId('export-xmp-btn');
    expect(exportBtn).toBeDisabled();
  });

  it('triggers onExportXmp when clicking enabled export button', () => {
    const onExport = vi.fn();
    render(
      <HarmonyPanel
        harmonies={mockHarmonies}
        photoPath="/path/test.CR3"
        onExportXmp={onExport}
      />
    );

    const exportBtn = screen.getByTestId('export-xmp-btn');
    expect(exportBtn).not.toBeDisabled();
    fireEvent.click(exportBtn);
    expect(onExport).toHaveBeenCalled();
  });

  it('renders export success message', () => {
    render(
      <HarmonyPanel
        harmonies={mockHarmonies}
        photoPath="/path/test.CR3"
        exportSuccessMessage="Wrote sidecar to /path/test.xmp"
      />
    );

    expect(screen.getByTestId('export-success-msg')).toHaveTextContent(
      'Wrote sidecar to /path/test.xmp'
    );
  });

  it('allows sliding and toggling key hue override', () => {
    const onKeyHue = vi.fn();
    render(
      <HarmonyPanel
        harmonies={mockHarmonies}
        photoPath="/path/test.CR3"
        keyHueOverride={null}
        onKeyHueChange={onKeyHue}
      />
    );

    // Slider is interactive and reflects active harmony primary spoke in Auto mode
    const slider = screen.getByTestId('key-hue-slider');
    expect(slider).toHaveValue('30');
    fireEvent.change(slider, { target: { value: '45' } });
    expect(onKeyHue).toHaveBeenCalledWith(45);

    // Clicking Auto toggle sets to spoke angle
    const toggleBtn = screen.getByTestId('toggle-auto-key-hue');
    fireEvent.click(toggleBtn);
    expect(onKeyHue).toHaveBeenCalledWith(30);
  });

  it('clicking Reset Auto when overridden resets key hue to null', () => {
    const onKeyHue = vi.fn();
    render(
      <HarmonyPanel
        harmonies={mockHarmonies}
        photoPath="/path/test.CR3"
        keyHueOverride={45}
        onKeyHueChange={onKeyHue}
      />
    );

    const toggleBtn = screen.getByTestId('toggle-auto-key-hue');
    expect(toggleBtn).toHaveTextContent('Reset Auto');
    fireEvent.click(toggleBtn);
    expect(onKeyHue).toHaveBeenCalledWith(null);
  });
});
