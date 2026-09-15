import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as Popover from '@radix-ui/react-popover';

describe('Popover', () => {
  it('opens when the trigger is clicked (and is left open)', () => {
    render(
      <Popover.Root>
        <Popover.Trigger>open</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content>
            <button>inside</button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );

    fireEvent.click(screen.getByText('open'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
