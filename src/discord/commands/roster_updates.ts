import { ParameterizedContext } from "koa"
import { CommandHandler, Command } from "../commands_handler"
import { respond, createMessageResponse, DiscordClient } from "../discord_utils"
import { APIApplicationCommandInteractionDataChannelOption, APIApplicationCommandInteractionDataSubcommandOption, ApplicationCommandOptionType, ApplicationCommandType, ChannelType, RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10"
import { Firestore } from "firebase-admin/firestore"
import LeagueSettingsDB, { DiscordIdType, RosterUpdatesConfiguration } from "../settings_db"

export default {
  async handleCommand(command: Command, client: DiscordClient, db: Firestore, ctx: ParameterizedContext) {
    const { guild_id } = command
    if (!command.data.options) {
      throw new Error("roster_updates command not defined properly")
    }
    const options = command.data.options
    const rosterCommand = options[0] as APIApplicationCommandInteractionDataSubcommandOption
    const subCommand = rosterCommand.name
    
    if (subCommand === "configure") {
      if (!rosterCommand.options || !rosterCommand.options[0]) {
        throw new Error("roster_updates configure misconfigured")
      }
      const channel = (rosterCommand.options[0] as APIApplicationCommandInteractionDataChannelOption).value
      
      const config: RosterUpdatesConfiguration = {
        channel: { id: channel, id_type: DiscordIdType.CHANNEL }
      }
      
      await LeagueSettingsDB.configureRosterUpdates(guild_id, config)
      respond(ctx, createMessageResponse(`Roster updates configured! Player changes will be posted to <#${channel}>`))
    } else {
      throw new Error(`roster_updates ${subCommand} not implemented`)
    }
  },
  commandDefinition(): RESTPostAPIApplicationCommandsJSONBody {
    return {
      name: "roster_updates",
      description: "Configure automatic roster change notifications",
      type: ApplicationCommandType.ChatInput,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "configure",
          description: "Set up the channel for roster updates",
          options: [
            {
              type: ApplicationCommandOptionType.Channel,
              name: "channel",
              description: "Channel to post player changes and updates",
              required: true,
              channel_types: [ChannelType.GuildText]
            }
          ]
        }
      ]
    }
  }
} as CommandHandler