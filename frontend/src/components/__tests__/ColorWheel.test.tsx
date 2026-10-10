import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ColorWheel from '../ColorWheel';
import { ColorSample } from '../../types';

describe('ColorWheel Component', () => {
  const sampleData: ColorSample[] = [
    {
      id: 'sample-1',
      name: 'Sky Blue',
      x: 100,
      y: 100,
      rgb: { r: 50, g: 150, b: 250 },
      hsl: { h: 210, s: 0.8, l: 0.6 },
    },
    {
      id: 'sample-2',
      name: 'Sunflower',
      x: 200,
      y: 200,
      rgb: { r: 250, g: 200, b: 50 },
      hsl: { h: 45, s: 0.9, l: 0.6 },
    },
  ];

  it('renders canvas element and controls', () => {
    render(<ColorWheel samples={sampleData} harmonyName="Complementary" />);

    expect(screen.getByTestId('vectorscope-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('pure-hue-toggle')).toBeInTheDocument();
    expect(screen.getByText('Complementary')).toBeInTheDocument();
  });

  it('toggles pure hue mode on button click', () => {
    const onToggle = vi.fn();
    render(<ColorWheel samples={sampleData} isPureHue={false} onTogglePureHue={onToggle} />);

    const toggleBtn = screen.getByTestId('pure-hue-toggle');
    expect(toggleBtn).toHaveTextContent('Pure Hue Mode OFF');

    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('renders with pure hue mode ON when controlled prop is true', () => {
    render(<ColorWheel samples={sampleData} isPureHue={true} />);

    const toggleBtn = screen.getByTestId('pure-hue-toggle');
    expect(toggleBtn).toHaveTextContent('Pure Hue Mode ON');
  });

  it('handles canvas click hit-testing: selects sample when clicked, null when empty space', () => {
    const onSelect = vi.fn();
    render(<ColorWheel samples={sampleData} onSelectSample={onSelect} />);

    const canvas = screen.getByTestId('vectorscope-canvas');
    // Sunflower is at theta=45, r=0.9 -> canvas coordinates approx (277, 277)
    fireEvent.click(canvas, { clientX: 277, clientY: 277 });
    expect(onSelect).toHaveBeenCalledWith(sampleData[1]);

    // Clicking center (180, 180) is far from samples (>14px) -> deselects
    fireEvent.click(canvas, { clientX: 180, clientY: 180 });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('shows tooltip on mouseMove over sample and hides on mouseLeave', () => {
    render(<ColorWheel samples={sampleData} />);

    const canvas = screen.getByTestId('vectorscope-canvas');
    fireEvent.mouseMove(canvas, { clientX: 277, clientY: 277 });
    expect(screen.getByText(/Sunflower/)).toBeInTheDocument();

    fireEvent.mouseLeave(canvas);
    expect(screen.queryByText(/Sunflower/)).not.toBeInTheDocument();
  });

  it('renders harmony spoke overlay with circular sorted angles', () => {
    const { container } = render(
      <ColorWheel
        samples={sampleData}
        harmonyName="Square"
        spokeAngles={[200, 290, 20, 110]}
      />
    );
    expect(container.querySelector('canvas')).toBeInTheDocument();
    expect(screen.getByText('Square')).toBeInTheDocument();
  });

  it('selects topmost marker when samples overlap in canvas z-order', () => {
    const overlappingSamples: ColorSample[] = [
      {
        id: 'under-sample',
        name: 'Under Marker',
        x: 10,
        y: 10,
        rgb: { r: 100, g: 100, b: 100 },
        hsl: { h: 45, s: 0.9, l: 0.5 },
      },
      {
        id: 'top-sample',
        name: 'Top Marker',
        x: 20,
        y: 20,
        rgb: { r: 250, g: 200, b: 50 },
        hsl: { h: 45, s: 0.9, l: 0.6 },
      },
    ];

    const onSelect = vi.fn();
    render(<ColorWheel samples={overlappingSamples} onSelectSample={onSelect} />);

    const canvas = screen.getByTestId('vectorscope-canvas');
    fireEvent.click(canvas, { clientX: 277, clientY: 277 });

    // Should select top-sample (index 1), which renders on top of under-sample (index 0)
    expect(onSelect).toHaveBeenCalledWith(overlappingSamples[1]);
  });
});
