import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImagePreview from '../ImagePreview';
import { ColorSample } from '../../types';

describe('ImagePreview Component', () => {
  const mockSamples: ColorSample[] = [
    {
      id: 'pin-1',
      name: 'Sky Blue',
      x: 500,
      y: 300,
      rgb: { r: 80, g: 160, b: 240 },
      hsl: { h: 210, s: 0.8, l: 0.63 },
    },
    {
      id: 'pin-2',
      name: 'Grass',
      x: 800,
      y: 700,
      rgb: { r: 50, g: 180, b: 60 },
      hsl: { h: 125, s: 0.72, l: 0.45 },
    },
  ];

  it('renders placeholder when no imageUrl is provided', () => {
    render(<ImagePreview samples={[]} />);
    expect(screen.getByText('No Photo Loaded')).toBeInTheDocument();
  });

  it('renders photo image and toolbar when imageUrl is provided', () => {
    render(
      <ImagePreview
        imageUrl="blob:http://localhost/test-preview.jpg"
        imageWidth={1920}
        imageHeight={1080}
        samples={mockSamples}
      />
    );

    const img = screen.getByAltText('Photo Preview');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'blob:http://localhost/test-preview.jpg');
    expect(screen.getByTestId('tool-sample')).toBeInTheDocument();
    expect(screen.getByTestId('tool-pan')).toBeInTheDocument();
  });

  it('renders sample pins with names and tags', () => {
    render(
      <ImagePreview
        imageUrl="blob:http://localhost/test-preview.jpg"
        imageWidth={1920}
        imageHeight={1080}
        samples={mockSamples}
      />
    );

    expect(screen.getByText('Sky Blue')).toBeInTheDocument();
    expect(screen.getByText('Grass')).toBeInTheDocument();
    expect(screen.getByTestId('sample-pin-pin-1')).toBeInTheDocument();
    expect(screen.getByTestId('sample-pin-pin-2')).toBeInTheDocument();
  });

  it('triggers onSelectSample when clicking a pin', () => {
    const onSelect = vi.fn();
    render(
      <ImagePreview
        imageUrl="blob:http://localhost/test-preview.jpg"
        imageWidth={1920}
        imageHeight={1080}
        samples={mockSamples}
        onSelectSample={onSelect}
      />
    );

    fireEvent.click(screen.getByTestId('sample-pin-pin-1'));
    expect(onSelect).toHaveBeenCalledWith(mockSamples[0]);
  });

  it('triggers onSampleClick when clicking image canvas without dragging', () => {
    const onSample = vi.fn();
    render(
      <ImagePreview
        imageUrl="blob:http://localhost/test-preview.jpg"
        imageWidth={1000}
        imageHeight={1000}
        samples={[]}
        onSampleClick={onSample}
      />
    );

    const container = screen.getByTestId('image-preview-container');
    // Simulate container dimensions in JSDOM
    const viewport = container.querySelector('div[style*="overflow: hidden"]')!;
    Object.defineProperty(viewport, 'clientWidth', { value: 1000, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 1000, configurable: true });
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
      configurable: true,
    });

    // Mousedown and mouseup at same coordinate (click)
    fireEvent.mouseDown(viewport, { clientX: 200, clientY: 300, button: 0 });
    fireEvent.mouseUp(viewport, { clientX: 200, clientY: 300, button: 0 });

    expect(onSample).toHaveBeenCalled();
  });

  it('allows renaming a sample pin label inline', () => {
    const onUpdate = vi.fn();
    render(
      <ImagePreview
        imageUrl="blob:http://localhost/test-preview.jpg"
        imageWidth={1920}
        imageHeight={1080}
        samples={mockSamples}
        selectedSampleId="pin-1"
        onUpdateSampleName={onUpdate}
      />
    );

    // Edit button on selected pin
    const editBtn = screen.getByTestId('edit-pin-pin-1');
    fireEvent.click(editBtn);

    const input = screen.getByTestId('edit-sample-input');
    expect(input).toHaveValue('Sky Blue');

    fireEvent.change(input, { target: { value: 'Tower in Sun' } });
    fireEvent.click(screen.getByTestId('save-sample-btn'));

    expect(onUpdate).toHaveBeenCalledWith('pin-1', 'Tower in Sun');
  });

  it('allows deleting a sample pin', () => {
    const onDelete = vi.fn();
    render(
      <ImagePreview
        imageUrl="blob:http://localhost/test-preview.jpg"
        imageWidth={1920}
        imageHeight={1080}
        samples={mockSamples}
        selectedSampleId="pin-2"
        onDeleteSample={onDelete}
      />
    );

    const deleteBtn = screen.getByTestId('delete-pin-pin-2');
    fireEvent.click(deleteBtn);

    expect(onDelete).toHaveBeenCalledWith('pin-2');
  });

  it('toggles active tool between sample and pan', () => {
    render(
      <ImagePreview
        imageUrl="blob:http://localhost/test-preview.jpg"
        imageWidth={1920}
        imageHeight={1080}
        samples={[]}
      />
    );

    const panBtn = screen.getByTestId('tool-pan');
    const sampleBtn = screen.getByTestId('tool-sample');

    fireEvent.click(panBtn);
    fireEvent.click(sampleBtn);
  });

  it('does not trigger onSampleClick when no photo is loaded', () => {
    const onSample = vi.fn();
    render(<ImagePreview samples={[]} onSampleClick={onSample} />);

    const container = screen.getByTestId('image-preview-container');
    const viewport = container.querySelector('div[style*="overflow: hidden"]')!;
    fireEvent.mouseDown(viewport, { clientX: 200, clientY: 300, button: 0 });
    fireEvent.mouseUp(viewport, { clientX: 200, clientY: 300, button: 0 });

    expect(onSample).not.toHaveBeenCalled();
  });

  it('clicking an existing pin selects it without triggering onSampleClick', () => {
    const onSelect = vi.fn();
    const onSample = vi.fn();
    render(
      <ImagePreview
        imageUrl="blob:http://localhost/test-preview.jpg"
        imageWidth={1920}
        imageHeight={1080}
        samples={mockSamples}
        onSelectSample={onSelect}
        onSampleClick={onSample}
      />
    );

    const pin = screen.getByTestId('sample-pin-pin-1');
    fireEvent.mouseDown(pin, { button: 0 });
    fireEvent.mouseUp(pin, { button: 0 });
    fireEvent.click(pin);

    expect(onSelect).toHaveBeenCalledWith(mockSamples[0]);
    expect(onSample).not.toHaveBeenCalled();
  });

  it('slow panning drag with multiple small increments does not trigger onSampleClick', () => {
    const onSample = vi.fn();
    render(
      <ImagePreview
        imageUrl="blob:http://localhost/test-preview.jpg"
        imageWidth={1000}
        imageHeight={1000}
        samples={[]}
        onSampleClick={onSample}
      />
    );

    const container = screen.getByTestId('image-preview-container');
    const viewport = container.querySelector('div[style*="overflow: hidden"]')!;

    // Start drag at (100, 100)
    fireEvent.mouseDown(viewport, { clientX: 100, clientY: 100, button: 0 });

    // Move in increments of 1-2px (sub-threshold per frame, but 10px total)
    fireEvent.mouseMove(viewport, { clientX: 102, clientY: 100 });
    fireEvent.mouseMove(viewport, { clientX: 104, clientY: 100 });
    fireEvent.mouseMove(viewport, { clientX: 106, clientY: 100 });
    fireEvent.mouseMove(viewport, { clientX: 108, clientY: 100 });
    fireEvent.mouseMove(viewport, { clientX: 110, clientY: 100 });

    // Release mouse
    fireEvent.mouseUp(viewport, { clientX: 110, clientY: 100, button: 0 });

    // Should NOT have sampled because it was a pan drag
    expect(onSample).not.toHaveBeenCalled();
  });

  it('zooms in when wheel event is dispatched and applies single zoom factor', () => {
    render(
      <ImagePreview
        imageUrl="blob:http://localhost/test-preview.jpg"
        imageWidth={1000}
        imageHeight={1000}
        samples={[]}
      />
    );

    const viewport = screen.getByTestId('image-preview-viewport');
    Object.defineProperty(viewport, 'clientWidth', { value: 1000, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 1000, configurable: true });
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
      configurable: true,
    });

    // Reset zoom to fit initially
    fireEvent.click(screen.getByTestId('reset-zoom-btn'));
    expect(screen.getByText(/92% \(1000×1000\)/)).toBeInTheDocument();

    // Dispatch wheel event (deltaY < 0 -> zoom in by 1.15x: 0.92 * 1.15 = 1.058 -> 106%)
    fireEvent.wheel(viewport, { deltaY: -100, clientX: 500, clientY: 500 });

    expect(screen.getByText(/106% \(1000×1000\)/)).toBeInTheDocument();
  });

  it('cancels inline label editing when Escape key is pressed', () => {
    render(
      <ImagePreview
        imageUrl="blob:http://localhost/test-preview.jpg"
        imageWidth={1920}
        imageHeight={1080}
        samples={mockSamples}
        selectedSampleId="pin-1"
      />
    );

    const editBtn = screen.getByTestId('edit-pin-pin-1');
    fireEvent.click(editBtn);

    const input = screen.getByTestId('edit-sample-input');
    expect(input).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('edit-sample-input')).not.toBeInTheDocument();
  });
});
