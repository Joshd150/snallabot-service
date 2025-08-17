import { ParameterizedContext } from "koa"
import { CommandHandler, Command, AutocompleteHandler, Autocomplete } from "../commands_handler"
import { respond, createMessageResponse, DiscordClient, SnallabotDiscordError, deferMessage } from "../discord_utils"
import { APIApplicationCommandInteractionDataBooleanOption, APIApplicationCommandInteractionDataChannelOption, APIApplicationCommandInteractionDataRoleOption, APIApplicationCommandInteractionDataStringOption, APIApplicationCommandInteractionDataSubcommandOption, APIApplicationCommandInteractionDataUserOption, ApplicationCommandOptionType, ChannelType, RESTPostAPIApplicationCommandsJSONBody, ComponentType, ButtonStyle, InteractionResponseType } from "discord-api-types/v10"
import { FieldValue, Firestore } from "firebase-admin/firestore"
import LeagueSettingsDB, { ChannelId, DiscordIdType, LeagueSettings, MessageId, TeamAssignments, UserId, WaitlistConfiguration } from "../settings_db"
import MaddenClient from "../../db/madden_db"
import { Team } from "../../export/madden_league_types"
import { teamSearchView, discordLeagueView } from "../../db/view"
import fuzzysort from "fuzzysort"
import MaddenDB from "../../db/madden_db"

// Team logos mapping (from player.ts enum structure)
const TEAM_LOGOS: { [key: string]: string } = {
  "Cardinals": "<:Arizona_Cardinals:1234567890>",
  "Falcons": "<:Falcons73:1234567890>", 
  "Ravens": "<:Baltimore_Ravens:1234567890>",
  "Bills": "<:Buffalo_Bills:1234567890>",
  "Panthers": "<:Panthers79:1234567890>",
  "Bears": "<:chi32:1234567890>",
  "Bengals": "<:Bengals:1234567890>",
  "Browns": "<:Browns:1234567890>",
  "Cowboys": "<:Cowboys:1234567890>",
  "Broncos": "<:Broncos:1234567890>",
  "Lions": "<:Detroit_Lions63:1234567890>",
  "Packers": "<:Packers:1234567890>",
  "Texans": "<:Houston_Texans:1234567890>",
  "Colts": "<:Colts:1234567890>",
  "Jaguars": "<:Jaguars:1234567890>",
  "Chiefs": "<:Kansas_City_Chiefs4:1234567890>",
  "Raiders": "<:Las_Vegas_Raiders:1234567890>",
  "Chargers": "<:Chargers:1234567890>",
  "Rams": "<:Rams:1234567890>",
  "Dolphins": "<:Miami_Dolphins:1234567890>",
  "Vikings": "<:Vikings9:1234567890>",
  "Patriots": "<:Patriots:1234567890>",
  "Saints": "<:New_Orleans_Saints:1234567890>",
  "Giants": "<:New_York_Giants:1234567890>",
  "Jets": "<:jets:1234567890>",
  "Eagles": "<:Philadelphia_Eagles:1234567890>",
  "Steelers": "<:Steelers:1234567890>",
  "Seahawks": "<:SEA65:1234567890>",
  "49ers": "<:49ers:1234567890>",
  "Buccaneers": "<:Tampa_Bay_Buccaneers:1234567890>",
  "Titans": "<:TEN74:1234567890>",
  "Commanders": "<:commanders:1234567890>"
}

function getTeamLogo(teamName: string): string {
  // Extract team nickname from display name (e.g., "Tampa Bay Buccaneers" -> "Buccaneers")
  const parts = teamName.split(' ')
  const nickname = parts[parts.length - 1]
  return TEAM_LOGOS[nickname] || "🏈"
}

function formatTeamsEmbed(teams: Team[], teamAssignments: TeamAssignments): { embeds: any[], components: any[] } {
  const divisions = {
    "AFC East": [] as Team[],
    "AFC North": [] as Team[],
    "AFC South": [] as Team[],
    "AFC West": [] as Team[],
    "NFC East": [] as Team[],
    "NFC North": [] as Team[],
    "NFC South": [] as Team[],
    "NFC West": [] as Team[]
  }

  // Group teams by division
  teams.forEach(team => {
    const divName = team.divName
    if (divisions[divName]) {
      divisions[divName].push(team)
    }
  })

  // Create formatted text instead of embeds for better user ping support
  let formattedMessage = "# 🏈 NFL Teams\n\n"
  const openTeams: string[] = []

  // Create AFC section
  formattedMessage += "## 🔴 AFC Conference\n\n"
  Object.entries(divisions)
    .filter(([divName]) => divName.startsWith('AFC'))
    .forEach(([divName, divTeams]) => {
      formattedMessage += `**${divName}**\n`
      const teamLines = divTeams
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map(team => {
          const user = teamAssignments?.[`${team.teamId}`]?.discord_user?.id
          const consoleUser = team.userName
          const logo = getTeamLogo(team.displayName)
          
          if (!user) {
            openTeams.push(team.displayName)
          }
          
          const assignment = [
            user ? `<@${user}>` : null,
            consoleUser ? `\`${consoleUser}\`` : "`CPU`"
          ].filter(Boolean).join(", ")
          
          return `${logo} ${team.displayName}: ${assignment}`
        })
      
      formattedMessage += teamLines.join('\n') + '\n\n'
    })


  // Create NFC section
  formattedMessage += "## 🔵 NFC Conference\n\n"
  Object.entries(divisions)
    .filter(([divName]) => divName.startsWith('NFC'))
    .forEach(([divName, divTeams]) => {
      formattedMessage += `**${divName}**\n`
      const teamLines = divTeams
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map(team => {
          const user = teamAssignments?.[`${team.teamId}`]?.discord_user?.id
          const consoleUser = team.userName
          const logo = getTeamLogo(team.displayName)
          
          if (!user) {
            openTeams.push(team.displayName)
          }
          
          const assignment = [
            user ? `<@${user}>` : null,
            consoleUser ? `\`${consoleUser}\`` : "`CPU`"
          ].filter(Boolean).join(", ")
          
          return `${logo} ${team.displayName}: ${assignment}`
        })
      
      formattedMessage += teamLines.join('\n') + '\n\n'
    })


  // Add open teams section
  const openTeamLogos = openTeams.map(team => getTeamLogo(team)).join(' ')
  formattedMessage += `## 🟢 Open Teams (${openTeams.length} available)\n${openTeamLogos || "All teams are assigned!"}`

  // Add waitlist button
  const components = [{
    type: ComponentType.ActionRow,
    components: [{
      type: ComponentType.Button,
      style: ButtonStyle.Primary,
      label: "Join/Leave Waitlist",
      custom_id: "teams:waitlist:toggle"
    }]
  }]

  return { message: formattedMessage, components }
}

async function updateTeamsMessage(client: DiscordClient, channel: ChannelId, messageId: MessageId, teams: Team[], assignments: TeamAssignments) {
  const { message, components } = formatTeamsEmbed(teams, assignments)
  
  try {
    await client.editMessage(channel, messageId, message, [])
  } catch (e) {
    throw e
  }
}


export async function fetchTeamsMessage(settings: LeagueSettings): Promise<string> {
  if (settings?.commands?.madden_league?.league_id) {
    const teams = await MaddenClient.getLatestTeams(settings.commands.madden_league.league_id)
    const { message } = formatTeamsEmbed(teams.getLatestTeams(), settings.commands.teams?.assignments || {})
    return message
  } else {
    return "# Teams\nNo Madden League connected. Connect Snallabot to your league and reconfigure"
  }
}

export default {
  async handleCommand(command: Command, client: DiscordClient, db: Firestore, ctx: ParameterizedContext) {
    const { guild_id } = command
    if (!command.data.options) {
      throw new Error("logger command not defined properly")
    }
    const options = command.data.options
    const teamsCommand = options[0] as APIApplicationCommandInteractionDataSubcommandOption
    const subCommand = teamsCommand.name
    const leagueSettings = await LeagueSettingsDB.getLeagueSettings(guild_id)
    if (subCommand === "configure") {
      if (!teamsCommand.options || !teamsCommand.options[0]) {
        throw new Error("teams configure misconfigured")
      }
      const channel: ChannelId = { id: (teamsCommand.options[0] as APIApplicationCommandInteractionDataChannelOption).value, id_type: DiscordIdType.CHANNEL }
      const useRoleUpdates = (teamsCommand.options?.[1] as APIApplicationCommandInteractionDataBooleanOption)?.value || false
      const oldChannelId = leagueSettings?.commands?.teams?.channel
      const oldMessageId = leagueSettings?.commands?.teams?.messageId
      if (oldChannelId && oldChannelId !== channel) {
        const message = await fetchTeamsMessage(leagueSettings)
        try {
          await client.deleteMessage(oldChannelId, oldMessageId || { id: "", id_type: DiscordIdType.MESSAGE })
        } catch (e) { }
        const newMessageId = await client.createMessage(channel, message, [])
        await LeagueSettingsDB.updateTeamConfiguration(guild_id, {
          channel: channel,
          messageId: newMessageId,
          useRoleUpdates: useRoleUpdates,
          assignments: leagueSettings?.commands?.teams?.assignments || {},
        })

        respond(ctx, createMessageResponse("Teams Configured"))
      } else {
        const oldMessageId = leagueSettings?.commands?.teams?.messageId
        if (leagueSettings.commands.teams && oldMessageId) {
          try {
            const messageExists = await client.checkMessageExists(channel, oldMessageId)
            if (messageExists) {
              await LeagueSettingsDB.updateTeamConfiguration(guild_id, {
                ...leagueSettings.commands.teams,
                useRoleUpdates: useRoleUpdates,
                assignments: leagueSettings?.commands.teams?.assignments || {},
              })
              const message = await fetchTeamsMessage(leagueSettings)
              await client.editMessage(channel, oldMessageId, message, [])
              respond(ctx, createMessageResponse("Teams Configured"))
            }
            return
          } catch (e) {
            console.debug(e)
          }
        }
        const message = await fetchTeamsMessage(leagueSettings)
        const messageId = await client.createMessage(channel, message, [])
        await LeagueSettingsDB.updateTeamConfiguration(guild_id, {
          channel: channel,
          messageId: messageId,
          useRoleUpdates: useRoleUpdates,
          assignments: leagueSettings?.commands?.teams?.assignments || {},
        })
        respond(ctx, createMessageResponse("Teams Configured"))
      }
    } else if (subCommand === "assign") {
      if (!teamsCommand.options || !teamsCommand.options[0] || !teamsCommand.options[1]) {
        throw new Error("teams assign misconfigured")
      }
      const teamSearchPhrase = (teamsCommand.options[0] as APIApplicationCommandInteractionDataStringOption).value.toLowerCase()
      const user = (teamsCommand.options[1] as APIApplicationCommandInteractionDataUserOption).value
      if (!leagueSettings?.commands?.madden_league?.league_id) {
        throw new Error("No Madden league linked, setup the bot with your madden league first.")
      }
      if (!leagueSettings?.commands?.teams?.channel.id) {
        throw new Error("Teams not configured, run /teams configure first")
      }
      const leagueId = leagueSettings.commands.madden_league.league_id
      const teams = await MaddenDB.getLatestTeams(leagueId)
      const teamsToSearch = await teamSearchView.createView(leagueId)
      if (!teamsToSearch) {
        throw new Error("no teams found")
      }
      const results = fuzzysort.go(teamSearchPhrase, Object.values(teamsToSearch), { keys: ["cityName", "abbrName", "nickName", "displayName"], threshold: 0.9 })
      if (results.length < 1) {
        throw new Error(`Could not find team for phrase ${teamSearchPhrase}.Enter a team name, city, abbreviation, or nickname.Examples: Buccaneers, TB, Tampa Bay, Bucs`)
      } else if (results.length > 1) {
        throw new Error(`Found more than one  team for phrase ${teamSearchPhrase}.Enter a team name, city, abbreviation, or nickname.Examples: Buccaneers, TB, Tampa Bay, Bucs.Found teams: ${results.map(t => t.obj.displayName).join(", ")} `)
      }
      const assignedTeam = results[0].obj
      const role = (teamsCommand?.options?.[2] as APIApplicationCommandInteractionDataRoleOption)?.value
      const roleAssignment = role ? { discord_role: { id: role, id_type: DiscordIdType.ROLE } } : {}
      const assignments = { ...leagueSettings.commands.teams?.assignments, [teams.getTeamForId(assignedTeam.id).teamId]: { discord_user: { id: user, id_type: DiscordIdType.USER }, ...roleAssignment } }
      leagueSettings.commands.teams.assignments = assignments
      await LeagueSettingsDB.updateAssignment(guild_id, assignments)
      const message = createTeamsMessage(leagueSettings, teams.getLatestTeams())
      try {
        await client.editMessage(leagueSettings.commands.teams.channel, leagueSettings.commands.teams.messageId, message, [])
        respond(ctx, createMessageResponse("Team Assigned"))
      } catch (e) {
        if (e instanceof SnallabotDiscordError) {
          if (e.isDeletedChannel()) {
            respond(ctx, createMessageResponse("The assignment was saved, but the channel the teams message was in got deleted. Do /teams configure again to pick a new one Error: " + e))
          } else if (e.isDeletedMessage()) {
            respond(ctx, createMessageResponse("The assignment was saved, but my original message was deleted. do /teams configure for me to resend it Error: " + e))
          } else {
            respond(ctx, createMessageResponse(`The assignment was saved, but I could not edit my message. Guidance: ${e.guidance} Error: ${e}`))
          }
        } else {
          respond(ctx, createMessageResponse("Could not update teams message. The assignment was saved, Error: " + e))
        }
      }
    } else if (subCommand === "free") {
      if (!teamsCommand.options || !teamsCommand.options[0]) {
        throw new Error("teams free misconfigured")
      }
      const teamSearchPhrase = (teamsCommand.options[0] as APIApplicationCommandInteractionDataStringOption).value.toLowerCase()
      if (!leagueSettings?.commands?.madden_league?.league_id) {
        throw new Error("No Madden league linked, setup the bot with your madden league first.")
      }
      if (!leagueSettings.commands.teams?.channel.id) {
        throw new Error("Teams not configured, run /teams configure first")
      }
      const leagueId = leagueSettings.commands.madden_league.league_id
      const teams = await MaddenClient.getLatestTeams(leagueId)
      const teamsToSearch = await teamSearchView.createView(leagueId)
      if (!teamsToSearch) {
        throw new Error("no teams found")
      }
      const results = fuzzysort.go(teamSearchPhrase, Object.values(teamsToSearch), { keys: ["cityName", "abbrName", "nickName", "displayName"], threshold: 0.9 })
      if (results.length < 1) {
        throw new Error(`Could not find team for phrase ${teamSearchPhrase}.Enter a team name, city, abbreviation, or nickname.Examples: Buccaneers, TB, Tampa Bay, Bucs`)
      } else if (results.length > 1) {
        throw new Error(`Found more than one  team for phrase ${teamSearchPhrase}.Enter a team name, city, abbreviation, or nickname.Examples: Buccaneers, TB, Tampa Bay, Bucs.Found teams: ${results.map(t => t.obj.displayName).join(", ")}`)
      }
      const assignedTeam = results[0].obj
      const teamIdToDelete = teams.getTeamForId(assignedTeam.id).teamId
      const currentAssignments = { ...leagueSettings.commands.teams.assignments }
      delete currentAssignments[`${teamIdToDelete}`]
      leagueSettings.commands.teams.assignments = currentAssignments
      await LeagueSettingsDB.removeAssignment(guild_id, teamIdToDelete)
      const message = createTeamsMessage(leagueSettings, teams.getLatestTeams())
      try {
        await client.editMessage(leagueSettings.commands.teams.channel, leagueSettings.commands.teams.messageId, message, [])
        respond(ctx, createMessageResponse("Team Freed"))
      } catch (e) {
        if (e instanceof SnallabotDiscordError) {
          if (e.isDeletedChannel()) {
            respond(ctx, createMessageResponse("The assignment was freed, but the channel the teams message was in got deleted. Do /teams configure again to pick a new one Error: " + e))
          } else if (e.isDeletedMessage()) {
            respond(ctx, createMessageResponse("The assignment was freed, but my original message was deleted. do /teams configure for me to resend it Error: " + e))
          } else {
            respond(ctx, createMessageResponse(`The assignment was freed, but I could not edit my message. Guidance: ${e.guidance} Error: ${e}`))
          }
        } else {
          respond(ctx, createMessageResponse("Could not update teams message. The assignment was freed, Error: " + e))
        }
      }
    } else if (subCommand === "reset") {
      if (!leagueSettings.commands.teams?.channel.id) {
        throw new Error("Teams not configured, run /teams configure first")
      }
      await LeagueSettingsDB.removeAllAssignments(guild_id)
      if (leagueSettings.commands.teams?.assignments) {
        leagueSettings.commands.teams.assignments = {}
      }
      const message = await fetchTeamsMessage(leagueSettings)
      try {
        const teams = await MaddenClient.getLatestTeams(leagueSettings.commands.madden_league.league_id)
        await updateTeamsMessage(client, leagueSettings.commands.teams.channel, leagueSettings.commands.teams.messageId, teams.getLatestTeams(), {})
        await updateTeamsMessage(client, leagueSettings.commands.teams.channel, leagueSettings.commands.teams.messageId, teams.getLatestTeams(), currentAssignments)
        await updateTeamsMessage(client, leagueSettings.commands.teams.channel, leagueSettings.commands.teams.messageId, teams.getLatestTeams(), assignments)
        respond(ctx, createMessageResponse("Team Assignments Reset"))
      } catch (e) {
        if (e instanceof SnallabotDiscordError) {
          if (e.isDeletedChannel()) {
            respond(ctx, createMessageResponse("The assignment was reset, but the channel the teams message was in got deleted. Do /teams configure again to pick a new one Error: " + e))
          } else if (e.isDeletedMessage()) {
            respond(ctx, createMessageResponse("The assignment was reset, but my original message was deleted. do /teams configure for me to resend it Error: " + e))
          } else {
            respond(ctx, createMessageResponse(`The assignment was reset, but I could not edit my message. Guidance: ${e.guidance} Error: ${e}`))
          }
        } else {
          respond(ctx, createMessageResponse("Could not update teams message. The assignment was reset, Error: " + e))
        }

      }
    } else {
      throw new Error(`teams ${subCommand} misconfigured`)
    }
  },
  commandDefinition(): RESTPostAPIApplicationCommandsJSONBody {
    return {
      name: "teams",
      description: "Displays the current teams in your league with the members the teams are assigned to",
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "assign",
          description: "assign a discord user to the specified team",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "team",
              description:
                "the team city, name, or abbreviation. Ex: Buccaneers, TB, Tampa Bay",
              required: true,
              autocomplete: true
            },
            {
              type: ApplicationCommandOptionType.User,
              name: "user",
              description: "the discord member you want to assign to this team",
              required: true,
            },
            {
              type: ApplicationCommandOptionType.Role,
              name: "role",
              description: "the role that will be tracked with this team",
              required: false,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "free",
          description: "remove the user assigned to this team, making the team open",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "team",
              description:
                "the team city, name, or abbreviation. Ex: Buccaneers, TB, Tampa Bay",
              required: true,
              autocomplete: true
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "configure",
          description: "sets channel that will display all the teams and the members assigned to them",
          options: [
            {
              type: ApplicationCommandOptionType.Channel,
              name: "channel",
              description: "channel to display your teams in",
              required: true,
              channel_types: [ChannelType.GuildText],
            },
            {
              type: ApplicationCommandOptionType.Boolean,
              name: "use_role_updates",
              description: "turn on role updates to auto assign teams based on team roles",
              required: false,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "reset",
          description: "resets all teams assignments making them all open",
          options: [],
        },
      ],
      type: 1,
    }
  },
  async choices(command: Autocomplete) {
    const { guild_id } = command
    if (!command.data.options) {
      throw new Error("logger command not defined properly")
    }
    const options = command.data.options
    const teamsCommand = options[0] as APIApplicationCommandInteractionDataSubcommandOption
    const subCommand = teamsCommand.name
    const view = await discordLeagueView.createView(guild_id)
    const leagueId = view?.leagueId
    if (leagueId && (teamsCommand?.options?.[0] as APIApplicationCommandInteractionDataStringOption)?.focused && teamsCommand?.options?.[0]?.value) {
      const teamSearchPhrase = teamsCommand.options[0].value as string
      const teamsToSearch = await teamSearchView.createView(leagueId)
      if (teamsToSearch) {
        const results = fuzzysort.go(teamSearchPhrase, Object.values(teamsToSearch), { keys: ["cityName", "abbrName", "nickName", "displayName"], threshold: 0.4, limit: 25 })
        return results.map(r => ({ name: r.obj.displayName, value: r.obj.displayName }))
      }
    }
    return []
  }
} as CommandHandler & AutocompleteHandler

// Add message component handler for waitlist button
export async function handleWaitlistToggle(interaction: any, client: DiscordClient) {
  const guildId = interaction.guild_id
  const userId = interaction.member?.user?.id || interaction.user?.id
  
  if (!userId) {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: "Error: Could not identify user",
        flags: 64
      }
    }
  }

  try {
    const leagueSettings = await LeagueSettingsDB.getLeagueSettings(guildId)
    const currentWaitlist = leagueSettings.commands.waitlist?.current_waitlist || []
    
    const userIndex = currentWaitlist.findIndex(u => u.id === userId)
    let newWaitlist: UserId[]
    let action: string
    
    if (userIndex === -1) {
      // Add user to waitlist
      newWaitlist = [...currentWaitlist, { id: userId, id_type: DiscordIdType.USER }]
      action = "joined"
    } else {
      // Remove user from waitlist
      newWaitlist = currentWaitlist.filter(u => u.id !== userId)
      action = "left"
    }
    
    const conf: WaitlistConfiguration = {
      current_waitlist: newWaitlist
    }
    
    await LeagueSettingsDB.configureWaitlist(guildId, conf)
    
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `You have ${action} the waitlist! Current position: ${action === "joined" ? newWaitlist.length : "Not on waitlist"}`,
        flags: 64
      }
    }
  } catch (e) {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: "Error updating waitlist: " + e,
        flags: 64
      }
    }
  }
}

// Export the handler for message components
export const messageComponentHandler = {
  async handleInteraction(interaction: any, client: DiscordClient) {
    if (interaction.custom_id === "teams:waitlist:toggle") {
      return await handleWaitlistToggle(interaction, client)
    }
    throw new Error("Unknown teams interaction: " + interaction.custom_id)
  }
}
