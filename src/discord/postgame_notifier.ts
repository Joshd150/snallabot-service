import { DiscordClient } from "./discord_utils"
import LeagueSettingsDB from "./settings_db"
import MaddenDB from "../db/madden_db"
import { MaddenGame, GameResult } from "../export/madden_league_types"

// Team logos for post-game stats
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

// Team colors for rich formatting
const TEAM_COLORS: { [key: string]: number } = {
  "Cardinals": 0x97233F,
  "Falcons": 0xA71930,
  "Ravens": 0x241773,
  "Bills": 0x00338D,
  "Panthers": 0x0085CA,
  "Bears": 0x0B162A,
  "Bengals": 0xFB4F14,
  "Browns": 0x311D00,
  "Cowboys": 0x041E42,
  "Broncos": 0xFB4F14,
  "Lions": 0x0076B6,
  "Packers": 0x203731,
  "Texans": 0x03202F,
  "Colts": 0x002C5F,
  "Jaguars": 0x006778,
  "Chiefs": 0xE31837,
  "Raiders": 0x000000,
  "Chargers": 0x0080C6,
  "Rams": 0x003594,
  "Dolphins": 0x008E97,
  "Vikings": 0x4F2683,
  "Patriots": 0x002244,
  "Saints": 0xD3BC8D,
  "Giants": 0x0B2265,
  "Jets": 0x125740,
  "Eagles": 0x004C54,
  "Steelers": 0xFFB612,
  "Seahawks": 0x002244,
  "49ers": 0xAA0000,
  "Buccaneers": 0xD50A0A,
  "Titans": 0x0C2340,
  "Commanders": 0x5A1414
}

function getTeamLogo(teamName: string): string {
  const parts = teamName.split(' ')
  const nickname = parts[parts.length - 1]
  return TEAM_LOGOS[nickname] || "🏈"
}

function getTeamColor(teamName: string): number {
  const parts = teamName.split(' ')
  const nickname = parts[parts.length - 1]
  return TEAM_COLORS[nickname] || 0x000000
}

export async function createPostGameNotifier(client: DiscordClient) {
  return {
    async notifyGameComplete(game: MaddenGame, leagueId: string) {
      try {
        const teams = await MaddenDB.getLatestTeams(leagueId)
        const awayTeam = teams.getTeamForId(game.awayTeamId)
        const homeTeam = teams.getTeamForId(game.homeTeamId)
        
        const awayLogo = getTeamLogo(awayTeam.displayName)
        const homeLogo = getTeamLogo(homeTeam.displayName)
        
        const isAwayWin = game.awayScore > game.homeScore
        const winnerLogo = isAwayWin ? awayLogo : homeLogo
        const winnerName = isAwayWin ? awayTeam.displayName : homeTeam.displayName
        const winnerColor = isAwayWin ? getTeamColor(awayTeam.displayName) : getTeamColor(homeTeam.displayName)
        
        const message = `🏆 **GAME COMPLETE** 🏆\n\n${winnerLogo} **${winnerName} WINS!**\n\n**Final Score:**\n${awayLogo} ${awayTeam.displayName}: ${game.awayScore}\n${homeLogo} ${homeTeam.displayName}: ${game.homeScore}`
        
        // Get all servers with this league connected
        const allSettings = await LeagueSettingsDB.getLeagueSettingsForLeagueId(leagueId)
        
        await Promise.all(allSettings.map(async settings => {
          const config = settings.commands.postgame_stats
          if (config) {
            try {
              await client.createMessage(config.channel, message, [])
            } catch (e) {
              console.error(`Failed to post game result for guild ${settings.guildId}:`, e)
            }
          }
        }))
      } catch (e) {
        console.error("Failed to create post-game notification:", e)
      }
    }
  }
}