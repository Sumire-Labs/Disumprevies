import type { StringSelectMenuInteraction } from 'discord.js';
import { buildDetectorPage, DETECTOR_UI_CONFIGS } from './_detectorFactory.js';

export async function handleMentionSettings(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const cfg = DETECTOR_UI_CONFIGS.mention;
  const page = await buildDetectorPage(guildId, cfg);
  await interaction.update(page);
}
