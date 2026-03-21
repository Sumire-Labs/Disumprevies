/**
 * Registry for premium appeal interaction handlers.
 * Core dispatches to these without creating a circular dependency.
 */

import type {
  ButtonInteraction,
  Client,
  ModalSubmitInteraction,
} from 'discord.js';

export type AppealButtonHandler = (
  interaction: ButtonInteraction,
  client: Client,
) => Promise<void>;

export type AppealModalHandler = (
  interaction: ModalSubmitInteraction,
  client: Client,
) => Promise<void>;

let buttonHandler: AppealButtonHandler | null = null;
let modalHandler: AppealModalHandler | null = null;

export function registerAppealInteractionHandlers(
  onButton: AppealButtonHandler,
  onModal: AppealModalHandler,
): void {
  buttonHandler = onButton;
  modalHandler = onModal;
}

export function getAppealButtonHandler(): AppealButtonHandler | null {
  return buttonHandler;
}

export function getAppealModalHandler(): AppealModalHandler | null {
  return modalHandler;
}

export function clearAppealInteractionHandlers(): void {
  buttonHandler = null;
  modalHandler = null;
}
