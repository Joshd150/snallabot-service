import { DiscordClient } from "./discord_utils"
import LeagueSettingsDB from "./settings_db"
import MaddenDB from "../db/madden_db"
import { Player, DevTrait } from "../export/madden_league_types"
import db from "../db/firebase"

// Dev trait emojis
const DEV_TRAIT_EMOJIS: { [key in DevTrait]: string } = {
  [DevTrait.NORMAL]: "",
  [DevTrait.STAR]: "⭐",
  [DevTrait.SUPERSTAR]: "<:Superstar:1234567890>",
  [DevTrait.XFACTOR]: "<:Superstar_X_Factor:1234567890>"
}

// Important stats to track
const IMPORTANT_STATS = [
  'playerBestOvr',
  'devTrait',
  'contractSalary',
  'contractYearsLeft',
  'teamId',
  'speedRating',
  'awareRating',
  'throwPowerRating',
  'throwAccRating'
]

export async function createRosterNotifier(client: DiscordClient) {
  return {
    async notifyPlayerChanges(players: Player[], leagueId: string) {
      try {
        const teams = await MaddenDB.getLatestTeams(leagueId)
        const allSettings = await LeagueSettingsDB.getLeagueSettingsForLeagueId(leagueId)
        
        // Group changes by player
        const playerChanges = new Map<number, any[]>()
        
        for (const player of players) {
          try {
            // Query player history from your existing Firestore structure
            const historySnapshot = await db
              .collection('madden_data26')
              .doc(leagueId)
              .collection('MADDEN_PLAYER')
              .doc(player.rosterId.toString())
              .collection('history')
              .orderBy('timestamp', 'desc')
              .limit(1)
              .get()
            
            if (!historySnapshot.empty) {
              const latestChange = historySnapshot.docs[0].data()
              const changes = []
              
              // Check for important stat changes
              for (const [field, changeData] of Object.entries(latestChange)) {
                if (IMPORTANT_STATS.includes(field) && field !== 'timestamp') {
                  const { oldValue, newValue } = changeData as { oldValue: any, newValue: any }
                  if (oldValue !== newValue) {
                    changes.push({ field, oldValue, newValue })
                  }
                }
              }
              
              if (changes.length > 0) {
                playerChanges.set(player.rosterId, changes)
              }
            }
          } catch (e) {
            console.error(`Failed to get history for player ${player.rosterId}:`, e)
          }
        }
        
        if (playerChanges.size > 0) {
          // Format notification message
          const changeMessages = []
          
          for (const [rosterId, changes] of playerChanges) {
            const player = players.find(p => p.rosterId === rosterId)
            if (!player) continue
            
            const teamAbbr = player.teamId > 0 ? teams.getTeamForId(player.teamId).abbrName : "FA"
            const devTraitEmoji = DEV_TRAIT_EMOJIS[player.devTrait]
            const playerName = `${player.firstName} ${player.lastName}`
            
            const changeTexts = changes.map(change => {
              const { field, oldValue, newValue } = change
              
              if (field === 'devTrait') {
                const oldEmoji = DEV_TRAIT_EMOJIS[oldValue as DevTrait]
                const newEmoji = DEV_TRAIT_EMOJIS[newValue as DevTrait]
                return `⭐ Dev Trait: ${oldEmoji || 'Normal'} → ${newEmoji || 'Normal'}`
              } else if (field === 'contractSalary') {
                return `💰 Salary: $${oldValue?.toLocaleString()} → $${newValue?.toLocaleString()}`
              } else if (field === 'teamId') {
                const oldTeam = oldValue > 0 ? teams.getTeamForId(oldValue).abbrName : "FA"
                const newTeam = newValue > 0 ? teams.getTeamForId(newValue).abbrName : "FA"
                return `🔄 Team: ${oldTeam} → ${newTeam}`
              } else if (field === 'playerBestOvr') {
                const diff = newValue - oldValue
                const arrow = diff > 0 ? '📈' : '📉'
                return `${arrow} Overall: ${oldValue} → ${newValue} (${diff > 0 ? '+' : ''}${diff})`
              } else {
                return `${field}: ${oldValue} → ${newValue}`
              }
            }).join('\n')
            
            changeMessages.push(`**${teamAbbr} ${playerName}** ${devTraitEmoji}\n${changeTexts}`)
          }
          
          const finalMessage = `# 📋 Roster Updates\n\n${changeMessages.join('\n\n')}`
          
          // Post to all configured channels
          await Promise.all(allSettings.map(async settings => {
            const config = settings.commands.roster_updates
            if (config) {
              try {
                await client.createMessage(config.channel, finalMessage, [])
              } catch (e) {
                console.error(`Failed to post roster updates for guild ${settings.guildId}:`, e)
              }
            }
          }))
        }
      } catch (e) {
        console.error("Failed to create roster notification:", e)
      }
    }
  }
}