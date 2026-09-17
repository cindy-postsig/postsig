/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const renderGroup = (variant?: 'segmented' | 'outline') =>
  render(
    <ToggleGroup type="single" variant={variant} aria-label="Method" value="a">
      <ToggleGroupItem value="a">A</ToggleGroupItem>
      <ToggleGroupItem value="b">B</ToggleGroupItem>
    </ToggleGroup>,
  );

describe('ToggleGroup', () => {
  it('draws the bordered track itself when segmented', () => {
    renderGroup('segmented');

    const track = screen.getByRole('radiogroup', { name: 'Method' });
    expect(track.className).toContain('border-border');
    expect(track.className).toContain('p-1');
  });

  it('leaves other variants trackless', () => {
    renderGroup('outline');

    const group = screen.getByRole('radiogroup', { name: 'Method' });
    expect(group.className).not.toContain('border-border');
  });
});
