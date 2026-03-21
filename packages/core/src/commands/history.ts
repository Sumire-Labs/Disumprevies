import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
} from 'discord.js';
import type { InfractionType } from '@prisma/client';
import { prisma } from '../db.js';
import { t } from '../i18n/index.js';
import { requirePermission } from './_helpers.js';
import { registerCommand } from './index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 5;
const COLLECTOR_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Embed color per type
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<InfractionType, number> = {
  WARN: 0xffa500,
  MUTE: 0xffff00,
  KICK: 0xff6600,
  BAN: 0xff0000,
};

// ---------------------------------------------------------------------------
// Build page embed
// ---------------------------------------------------------------------------

interface HistoryPage {
  guildId: string;
  tag: string;
  userId: string;
  infractions: Array<{
    id: number;
    type: InfractionType;
    reason: string | null;
    moderator: string | null;
    auto: boolean;
    createdAt: Date;
  }>;
  page: number;
  totalPages: number;
  totalCount: number;
}

async function buildEmbed(data: HistoryPage): Promise<EmbedBuilder> {
  const guildId = data.guildId;

  const title = await t(guildId, 'command.history.title', { tag: data.tag });
  const footerText = await t(guildId, 'command.history.footer', {
    page: String(data.page + 1),
    total: String(data.totalPages),
    count: String(data.totalCount),
  });

  const [fieldType, fieldReason, fieldMod, fieldDate, fieldAuto, autoYes, autoNo, noReason, modAuto] =
    await Promise.all([
      t(guildId, 'command.history.field.type'),
      t(guildId, 'command.history.field.reason'),
      t(guildId, 'command.history.field.moderator'),
      t(guildId, 'command.history.field.date'),
      t(guildId, 'command.history.field.auto'),
      t(guildId, 'command.history.autoYes'),
      t(guildId, 'command.history.autoNo'),
      t(guildId, 'command.history.noReason'),
      t(guildId, 'command.history.moderatorAuto'),
    ]);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x5865f2)
    .setFooter({ text: footerText })
    .setTimestamp();

  for (const inf of data.infractions) {
    const typeColor = TYPE_COLORS[inf.type];
    const reasonText = inf.reason ?? noReason;
    const modText = inf.auto ? modAuto : (inf.moderator !== null ? `<@${inf.moderator}>` : modAuto);
    const autoText = inf.auto ? autoYes : autoNo;
    const dateText = `<t:${Math.floor(inf.createdAt.getTime() / 1000)}:f>`;

    embed.addFields({
      name: `\`#${inf.id}\` — ${inf.type}`,
      value: [
        `**${fieldType}:** ${inf.type}`,
        `**${fieldReason}:** ${reasonText}`,
        `**${fieldMod}:** ${modText}`,
        `**${fieldDate}:** ${dateText}`,
        `**${fieldAuto}:** ${autoText}`,
      ].join('\n'),
    });
  }

  // Colour the embed by the most severe infraction type on the page
  const severityOrder: InfractionType[] = ['BAN', 'KICK', 'MUTE', 'WARN'];
  for (const type of severityOrder) {
    if (data.infractions.some((i) => i.type === type)) {
      embed.setColor(typeColor(type));
      break;
    }
  }

  return embed;
}

function typeColor(type: InfractionType): number {
  return TYPE_COLORS[type];
}

// ---------------------------------------------------------------------------
// Button row builder
// ---------------------------------------------------------------------------

function buildRow(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  const prev = new ButtonBuilder()
    .setCustomId('history_prev')
    .setLabel('◀ Previous')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 0);

  const next = new ButtonBuilder()
    .setCustomId('history_next')
    .setLabel('Next ▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next);
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

registerCommand({
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View infraction history for a member')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to look up').setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || interaction.guild === null) return;

    const allowed = await requirePermission(interaction, PermissionFlagsBits.ModerateMembers);
    if (!allowed) return;

    const targetUser = interaction.options.getUser('user', true);
    const guildId = interaction.guildId;

    // Defer so we have time to fetch
    await interaction.deferReply({ ephemeral: true });

    const totalCount = await prisma.infraction.count({
      where: { guildId, userId: targetUser.id },
    });

    if (totalCount === 0) {
      const msg = await t(guildId, 'command.history.noInfractions');
      await interaction.editReply({ content: msg });
      return;
    }

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    let currentPage = 0;

    const fetchPage = async (page: number): Promise<HistoryPage> => {
      const infractions = await prisma.infraction.findMany({
        where: { guildId, userId: targetUser.id },
        orderBy: { createdAt: 'desc' },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          type: true,
          reason: true,
          moderator: true,
          auto: true,
          createdAt: true,
        },
      });
      return {
        guildId,
        tag: targetUser.tag,
        userId: targetUser.id,
        infractions,
        page,
        totalPages,
        totalCount,
      };
    };

    const pageData = await fetchPage(currentPage);
    const embed = await buildEmbed(pageData);
    const row = buildRow(currentPage, totalPages);

    const reply = await interaction.editReply({
      embeds: [embed],
      components: totalPages > 1 ? [row] : [],
    });

    if (totalPages <= 1) return;

    // Pagination collector — only the original user can interact
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: COLLECTOR_TIMEOUT_MS,
      filter: (btn: ButtonInteraction) => btn.user.id === interaction.user.id,
    });

    collector.on('collect', async (btn: ButtonInteraction) => {
      if (btn.customId === 'history_prev') {
        currentPage = Math.max(0, currentPage - 1);
      } else if (btn.customId === 'history_next') {
        currentPage = Math.min(totalPages - 1, currentPage + 1);
      }

      const newData = await fetchPage(currentPage);
      const newEmbed = await buildEmbed(newData);
      const newRow = buildRow(currentPage, totalPages);

      await btn.update({ embeds: [newEmbed], components: [newRow] });
    });

    collector.on('end', async () => {
      // Disable buttons after timeout
      const disabledRow = buildRow(currentPage, totalPages);
      disabledRow.components.forEach((btn) => btn.setDisabled(true));
      await interaction.editReply({ components: [disabledRow] }).catch(() => undefined);
    });
  },
});
