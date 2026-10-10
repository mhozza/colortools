import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App smoke test', () => {
  it('renders application header', () => {
    render(<App />);
    expect(screen.getByText('Photographic Color Harmony Assistant')).toBeInTheDocument();
  });
});
