import { ParameterizedContext } from "koa"
import { CommandHandler, Command } from "../commands_handler"
import { respond, createMessageResponse, DiscordClient } from "../discord_utils"
import { APIApplicationCommandInteractionDataChannelOption, APIApplicationCommandInteractionDataSubcommandOption, ApplicationCommandOptionType, ApplicationCommandType, ChannelType, RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10"
import { Firestore } from "firebase-admin/firestore"
import LeagueSettingsDB, { DiscordIdType, PostGameStatsConfiguration } from "../settings_db"

export default {
  async handleCommand(command: Command, client: DiscordClient, db: Firestore, ctx: ParameterizedContext) {
    const { guild_id } = command
    if (!command.data.options) {
      throw new Error("postgame_stats command not defined properly")
    }
    const options = command.data.options
    const postgameCommand = options[0] as APIApplicationCommandInteractionDataSubcommandOption
    const subCommand = postgameCommand.name
    
    if (subCommand === "configure") {
      if (!postgameCommand.options || !postgameCommand.options[0]) {
        throw new Error("postgame_stats configure misconfigured")
      }
      const channel = (postgameCommand.options[0] as APIApplicationCommandInteractionDataChannelOption).value
      
      const config: PostGameStatsConfiguration = {
        channel: { id: channel, id_type: DiscordIdType.CHANNEL }
      }
      
      await LeagueSettingsDB.configurePostGameStats(guild_id, config)
      respond(ctx, createMessageResponse(`Post-game stats configured! Game results will be posted to <#${channel}>`))
    } else {
      throw new Error(`postgame_stats ${subCommand} not implemented`)
    }
  },
  commandDefinition(): RESTPostAPIApplicationCommandsJSONBody {
    return {
      name: "postgame_stats",
      description: "Configure automatic post-game statistics notifications",
      type: ApplicationCommandType.ChatInput,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "configure",
          description: "Set up the channel for post-game stats",
          options: [
            {
              type: ApplicationCommandOptionType.Channel,
              name: "channel",
              description: "Channel to post game results and stats",
              required: true,
              channel_types: [ChannelType.GuildText]
            }
          ]
        }
      ]
    }
  }
} as CommandHandler