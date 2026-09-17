import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

describe('DropdownMenu', () => {
  // jsdom 24 has no PointerEvent, so RTL's pointerDown carries no `button`; open via keyboard.
  it('opens on Enter (and is left open)', () => {
    render(
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>open</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item>item</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );

    fireEvent.keyDown(screen.getByText('open'), { key: 'Enter' });
    expect(screen.getByRole('menu')).toBeTruthy();
  });
});
