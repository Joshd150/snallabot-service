# EA API Documentation

This documents every endpoint known from reverse engineering the Companion App. These calls must be done in order.

## Constants (Madden 26)

These values change each Madden year. The current values for Madden 26 are:

```ts
const AUTH_SOURCE = 317239
const CLIENT_SECRET = "teJpJ9cSXFqZAuKNW8IuHpy8D4dwWPoVrPoek38iCnrGbrUSfjqnHMBAv8iCVjeSm_20250910175618"
const REDIRECT_URL = "http://127.0.0.1/success"
const CLIENT_ID = "MCA_26_COMP_APP"
const MACHINE_KEY = "444d362e8e067fe2"
const YEAR = "2026"
const TWO_DIGIT_YEAR = "26"
```

---

## Step 1: EA Login URL

Direct the user to this URL to log in:

```
https://accounts.ea.com/connect/auth?hide_create=true&release_type=prod&response_type=code&redirect_uri=http://127.0.0.1/success&client_id=MCA_26_COMP_APP&machineProfileKey=444d362e8e067fe2&authentication_source=317239
```

After login, EA redirects to a URL like:

```
http://127.0.0.1/success?code=CODE_HERE
```

Parse the `code` query parameter from that URL. It is used in Step 2.

---

## Step 2: Exchange Code for Access Token

```
POST https://accounts.ea.com/connect/token
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
```

Body:
```
authentication_source=${AUTH_SOURCE}&client_secret=${CLIENT_SECRET}&grant_type=authorization_code&code=${code}&redirect_uri=${REDIRECT_URL}&release_type=prod&client_id=${CLIENT_ID}
```

Headers (emulate Android device exactly):
```
Accept-Charset: UTF-8
User-Agent: Dalvik/2.1.0 (Linux; U; Android 13; sdk_gphone_x86_64 Build/TE1A.220922.031)
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Accept-Encoding: gzip
```

Response:
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

This token is **temporary** — only used to retrieve entitlements and personas in Steps 3–5. Do not persist it. The token you actually save comes from Step 6.

---

## Step 3: Retrieve PID

```
GET https://accounts.ea.com/connect/tokeninfo?access_token=${access_token}
```

Headers:
```
Accept-Charset: UTF-8
X-Include-Deviceid: true
User-Agent: Dalvik/2.1.0 (Linux; U; Android 13; sdk_gphone_x86_64 Build/TE1A.220922.031)
Accept-Encoding: gzip
```

Response contains `pid_id` — used in Step 4.

---

## Step 4: Retrieve Entitlements

```
GET https://gateway.ea.com/proxy/identity/pids/${pid_id}/entitlements/?status=ACTIVE
Authorization: Bearer ${access_token}
```

Headers:
```
User-Agent: Dalvik/2.1.0 (Linux; U; Android 13; sdk_gphone_x86_64 Build/TE1A.220922.031)
Accept-Charset: UFT-8
X-Expand-Results: true
Accept-Encoding: gzip
```

Filter the returned `entitlement` array for entries where:
- `entitlementTag === "ONLINE_ACCESS"`
- `groupName` is one of the valid Madden 26 entitlements:

```ts
{
  xone: "MADDEN_26XONE",
  ps4:  "MADDEN_26PS4",
  pc:   "MADDEN_26PC",
  ps5:  "MADDEN_26PS5",
  xbsx: "MADDEN_26XBSX",
  stadia: "MADDEN_26SDA"
}
```

Each entitlement has a `pidUri` used in Step 5.

---

## Step 5: Retrieve Personas

For each valid entitlement:

```
GET https://gateway.ea.com/proxy/identity${pidUri}/personas?status=ACTIVE&access_token=${access_token}
```

Headers:
```
Accept-Charset: UTF-8
X-Expand-Results: true
User-Agent: Dalvik/2.1.0 (Linux; U; Android 13; sdk_gphone_x86_64 Build/TE1A.220922.031)
Accept-Encoding: gzip
```

Filter personas so that `persona.namespaceName` matches the expected namespace for their entitlement:

```ts
{
  "MADDEN_26XONE": "xbox",
  "MADDEN_26PS4":  "ps3",
  "MADDEN_26PC":   "cem_ea_id",
  "MADDEN_26PS5":  "ps3",
  "MADDEN_26XBSX": "xbox",
  "MADDEN_26SDA":  "stadia"
}
```

The user selects one persona. Store the `personaId` and the matched `maddenEntitlement`/`namespaceName`.

---

## Step 6: Get Persona-Scoped Access Token

Exchange the selected persona for a persona-specific access token. First, get a code:

```
GET https://accounts.ea.com/connect/auth?hide_create=true&release_type=prod&response_type=code&redirect_uri=${REDIRECT_URL}&client_id=${CLIENT_ID}&machineProfileKey=${MACHINE_KEY}&authentication_source=${AUTH_SOURCE}&access_token=${access_token}&persona_id=${personaId}&persona_namespace=${namespaceName}
```

Set `redirect: "manual"` — EA redirects to the localhost URL with a `code` query param. Extract that code, then exchange it:

```
POST https://accounts.ea.com/connect/token
```

Body:
```
authentication_source=${AUTH_SOURCE}&code=${eaCode}&grant_type=authorization_code&token_format=JWS&release_type=prod&client_secret=${CLIENT_SECRET}&redirect_uri=${REDIRECT_URL}&client_id=${CLIENT_ID}
```

This returns a new `access_token` and `refresh_token` scoped to the persona's console platform. **This is the token pair you persist.** Use `expires_in` to track expiry and refresh via Step 7 when needed. This token is what gets passed to Blaze in Step 8.

---

## Step 7: Token Refresh

When a token has expired (compare current time against stored expiry):

```
POST https://accounts.ea.com/connect/token
```

Body:
```
grant_type=refresh_token&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&release_type=prod&refresh_token=${refresh_token}&authentication_source=${AUTH_SOURCE}&token_format=JWS
```

Same headers as Step 2. Returns a new `access_token` and `refresh_token`.

---

## Step 8: Blaze Session Login

All Madden league data goes through EA's Blaze service. Establish a session first:

```
POST https://wal2.tools.gos.bio-iad.ea.com/wal/authentication/login
```

Body:
```json
{
  "accessToken": "<access_token>",
  "productName": "<blaze_product_name>"
}
```

The `productName` per platform (Madden 26):
```ts
{
  xone:   "madden-2026-xone-mca",
  ps4:    "madden-2026-ps4-mca",
  pc:     "madden-2026-pc-mca",
  ps5:    "madden-2026-ps5-mca",
  xbsx:   "madden-2026-xbsx-mca",
  stadia: "madden-2026-stadia-mca"
}
```

Headers (all Blaze requests use these):
```
Accept-Charset: UTF-8
Accept: application/json
X-BLAZE-ID: <blaze_service_id>
X-BLAZE-VOID-RESP: XML
X-Application-Key: MADDEN-MCA
Content-Type: application/json
User-Agent: Dalvik/2.1.0 (Linux; U; Android 13; sdk_gphone_x86_64 Build/TE1A.220922.031)
```

The `X-BLAZE-ID` per platform (Madden 26):
```ts
{
  xone:   "madden-2026-xone",
  ps4:    "madden-2026-ps4",
  pc:     "madden-2026-pc",
  ps5:    "madden-2026-ps5",
  xbsx:   "madden-2026-xbsx",
  stadia: "madden-2026-stadia"
}
```

**Note:** EA Blaze uses legacy SSL. You must disable certificate verification and enable `SSL_OP_LEGACY_SERVER_CONNECT` in your HTTP client.

Response contains:
- `userLoginInfo.sessionKey` — used in all subsequent Blaze requests
- `userLoginInfo.personaDetails.personaId` — the Blaze ID

Store both. The `sessionKey` can expire; detect this by catching Blaze errors and re-authenticating.

---

## Step 9: Blaze Requests (League Data via RPC)

General Blaze RPC calls go to:

```
POST https://wal2.tools.gos.bio-iad.ea.com/wal/mca/Process/${sessionKey}
```

Body:
```json
{
  "apiVersion": 2,
  "clientDevice": 3,
  "requestInfo": "<JSON string>"
}
```

The `requestInfo` is a JSON-stringified object:
```json
{
  "commandName": "...",
  "componentId": 2060,
  "commandId": ...,
  "componentName": "careermode",
  "messageAuthData": "...",
  "messageExpirationTime": <unix seconds>,
  "deviceId": "444d362e8e067fe2",
  "ipAddress": "127.0.0.1",
  "requestPayload": "<JSON string of payload>"
}
```

### Message Auth Calculation

Each request requires a signed auth blob:

1. Generate 4 random bytes
2. Build a JSON string: `{ "staticData": "05e6a7ead5584ab4", "requestId": <requestId>, "blazeId": <blazeId> }`
3. XOR the UTF-8 bytes of that JSON with an MD5 of `[rand4bytes + staticBytes]` (where `staticBytes = Buffer.from("634203362017bf72f70ba900c0aa4e6b", "hex")`)
4. Concatenate `[rand4bytes + xorResult]` → this is `authDataBytes`
5. `authData = authDataBytes.toString("base64")`
6. `authCode = MD5(staticAuthCode + authDataBytes).toString("base64")` where `staticAuthCode = Buffer.from("3a53413521464c3b6531326530705b70203a2900", "hex")`
7. `authType = 17039361`

### Known RPC Commands

**Get My Leagues**
```json
{
  "commandName": "Mobile_GetMyLeagues",
  "componentId": 2060,
  "commandId": 801,
  "requestPayload": {}
}
```
[Example Response](https://github.com/snallabot/snallabot-service/blob/main/docs/madden/api_data/get_leagues.json)

**Get League Hub (League Info)**
```json
{
  "commandName": "Mobile_Career_GetLeagueHub",
  "componentId": 2060,
  "commandId": 811,
  "requestPayload": { "leagueId": <leagueId> }
}
```
[Example Response](https://github.com/snallabot/snallabot-service/blob/main/docs/madden/api_data/get_league.json)

The league info response includes:
- `careerHubInfo.seasonInfo` — current week, week type, season year
- `teamIdInfoList` — array of `{ teamId, teamIndex, shortName, displayName }`
- `availableWeekInfoList` — weeks with data available
- `playerCountInfo` — roster/FA counts

**Clear Cap Penalties**
```json
{
  "commandName": "Mobile_UserAdmin_ClearCapPenalties",
  "componentId": 2060,
  "commandId": <TBD: see src/discord/madden_admin_writes.ts>,
  "componentName": "careermode",
  "requestPayload": { "leagueId": <leagueId>, "clearedUserId": <userId> }
}
```
Zeros the salary-cap penalty on the targeted user's team. Visible in the next `Mobile_Career_GetLeagueHub` fetch via `userInfoMap[userId].salaryCapPenalty`.

**Force Game Result**

Three command name variants share one envelope shape; the side (home / away / clear) is encoded in `commandName`:

```json
{
  "commandName": "Mobile_GameSchedule_ForceHomeWin",
  "componentId": 2060,
  "commandId": <TBD: see src/discord/madden_admin_writes.ts>,
  "componentName": "careermode",
  "requestPayload": { "leagueId": <leagueId>, "seasonGameKey": <key> }
}
```

```json
{
  "commandName": "Mobile_GameSchedule_ForceAwayWin",
  "componentId": 2060,
  "commandId": <TBD: see src/discord/madden_admin_writes.ts>,
  "componentName": "careermode",
  "requestPayload": { "leagueId": <leagueId>, "seasonGameKey": <key> }
}
```

```json
{
  "commandName": "Mobile_GameSchedule_ForceNoWin",
  "componentId": 2060,
  "commandId": <TBD: see src/discord/madden_admin_writes.ts>,
  "componentName": "careermode",
  "requestPayload": { "leagueId": <leagueId>, "seasonGameKey": <key> }
}
```

`seasonGameKey` comes from `gameScheduleHubInfo.leagueSchedule[].seasonGameKey` in the league hub response. `ForceNoWin` clears a previously-set force. Reversible until the week advances.

**Boot User from League**
```json
{
  "commandName": "Mobile_UserAdmin_BootUser",
  "componentId": 2060,
  "commandId": <TBD: see src/discord/madden_admin_writes.ts>,
  "componentName": "careermode",
  "requestPayload": { "leagueId": <leagueId>, "bootedUserId": <userId> }
}
```
Permanently removes the targeted user from the league at EA's side. Not reversible from the API — user must be re-invited via Companion App or console.

**Add Co-Admin**
```json
{
  "commandName": "Mobile_UserAdmin_AddAdmin",
  "componentId": 2060,
  "commandId": <TBD: see src/discord/madden_admin_writes.ts>,
  "componentName": "careermode",
  "requestPayload": { "leagueId": <leagueId>, "newAdminUserId": <userId> }
}
```
Promotes the targeted user to `ADMINLEVEL_ADMIN`. Requires the calling persona to be `ADMINLEVEL_OWNER`. Does NOT transfer the master role — that's a separate command (`Mobile_UserAdmin_TransferAdmin`, not yet integrated).

**Remove Co-Admin**
```json
{
  "commandName": "Mobile_UserAdmin_RemoveAdmin",
  "componentId": 2060,
  "commandId": <TBD: see src/discord/madden_admin_writes.ts>,
  "componentName": "careermode",
  "requestPayload": { "leagueId": <leagueId>, "newAdminUserId": <userId> }
}
```
Demotes a co-admin back to `ADMINLEVEL_NONE`. The `newAdminUserId` field is reused (the field name reflects "target user," not "new admin"). Does not affect the master role.

**Toggle Autopilot**
```json
{
  "commandName": "Mobile_UserAdmin_ToggleAutoPilot",
  "componentId": 2060,
  "commandId": <TBD: see src/discord/madden_admin_writes.ts>,
  "componentName": "careermode",
  "requestPayload": {
    "leagueId": <leagueId>,
    "toggleAutoPilotUserId": <userId>,
    "actionTimeout": <seconds>
  }
}
```
Toggles autopilot on/off for the targeted user's team. `actionTimeout` is the duration in seconds before EA auto-actions on the user's behalf when autopilot is on; corresponds to `userInfoMap[userId].defaultRequestActionTimeout`. Cannot enable an unlimited timeout unless `userAdminInfo.canEnableUnlimitedAutoPilot` is `true`.

**Submit Response (Advance / Sim-to / Approve Action)**
```json
{
  "commandName": "Mobile_Career_SubmitResponse",
  "componentId": 2060,
  "commandId": <TBD: see src/discord/madden_admin_writes.ts>,
  "componentName": "careermode",
  "requestPayload": {
    "leagueId": <leagueId>,
    "requestId": <requestId>,
    "responseKey": <responseKey>
  }
}
```

`requestId` and `responseKey` come from `careerHubInfo.requestInfoList[]` in the league hub response. The Companion App uses this single command for several distinct flows — fetch the league hub, locate the relevant request entry, and submit one of its valid `responseKey` values:

- **Week advance** — the `AdvanceStage` request entry. There is no dedicated `Mobile_*ForceAdvance*` command; this is the canonical advance implementation.
- **Sim-to-X** — sim-to-Playoffs, sim-to-SuperBowl, sim-to-end-of-season, sim-10-years; each is a distinct `responseKey` against the same `AdvanceStage` request.
- **Approve / reject pending user-actions** — release requests, sign requests, trade proposals (queued in `requestInfoList` after a member submits them).

Once Madden runs the simulation following an advance / sim-to, the action is irreversible. `careerHubInfo.isLeagueAdvancing` is `true` until simulation completes (typically 30s–5min).

---

### Coverage note — write commands documented in static analysis but not yet integrated

The Companion App APK (per `global-metadata.dat` / `libil2cpp.so` analysis) exposes these additional admin RPCs that have not been promoted to production wrappers:

```json
{
  "commandName": "Mobile_UserAdmin_TransferAdmin",
  "componentId": 2060,
  "commandId": "<not yet probed>",
  "componentName": "careermode",
  "requestPayload": { "leagueId": <leagueId>, "newAdminUserId": <userId> }
}
```

Transfers the master commish role. Distinct from `AddAdmin` / `RemoveAdmin`. **Caller loses its own master scope on success** — the new master must hand it back.

```json
{
  "commandName": "Mobile_SetPlayerToDepthChart",
  "componentId": 2060,
  "commandId": "<not yet probed>",
  "componentName": "careermode",
  "requestPayload": "<unprobed — likely { leagueId, teamId, position, slotIndex, playerId }>"
}
```

Modifies a team's depth chart. Read counterpart is `Mobile_GetDepthChart` (also not yet integrated). Payload shape is inferred from static analysis; one probe fire on a dev league would confirm.

---

## Step 10: Export Data Requests

League stat/roster exports use a separate endpoint pattern:

```
POST https://wal2.tools.gos.bio-iad.ea.com/wal/mca/${exportType}/${sessionKey}
```

Same headers as all Blaze requests. The body is a JSON object with `leagueId` plus any additional parameters.

These responses may contain control characters — strip characters in the range `\u0000–\u001F` and `\u007F–\u009F` before JSON parsing.

EA sometimes returns `ERR_TIMEOUT` errors. Retry with exponential backoff (default: 5 attempts, 1 second base delay).

### Export Types

| Enum | Endpoint Name | Extra Parameters |
|---|---|---|
| `TEAMS` | `CareerMode_GetLeagueTeamsExport` | `leagueId` |
| `STANDINGS` | `CareerMode_GetStandingsExport` | `leagueId` |
| `WEEKLY_SCHEDULE` | `CareerMode_GetWeeklySchedulesExport` | `leagueId`, `stageIndex`, `weekIndex` |
| `RUSHING_STATS` | `CareerMode_GetWeeklyRushingStatsExport` | `leagueId`, `stageIndex`, `weekIndex` |
| `TEAM_STATS` | `CareerMode_GetWeeklyTeamStatsExport` | `leagueId`, `stageIndex`, `weekIndex` |
| `PUNTING_STATS` | `CareerMode_GetWeeklyPuntingStatsExport` | `leagueId`, `stageIndex`, `weekIndex` |
| `RECEIVING_STATS` | `CareerMode_GetWeeklyReceivingStatsExport` | `leagueId`, `stageIndex`, `weekIndex` |
| `DEFENSIVE_STATS` | `CareerMode_GetWeeklyDefensiveStatsExport` | `leagueId`, `stageIndex`, `weekIndex` |
| `KICKING_STATS` | `CareerMode_GetWeeklyKickingStatsExport` | `leagueId`, `stageIndex`, `weekIndex` |
| `PASSING_STATS` | `CareerMode_GetWeeklyPassingStatsExport` | `leagueId`, `stageIndex`, `weekIndex` |
| `TEAM_ROSTER` | `CareerMode_GetTeamRostersExport` | `leagueId`, `listIndex`, `returnFreeAgents`, `teamId` |

### Stage Index Values

```ts
PRESEASON = 0
SEASON = 1
```

### Week Index Notes

- Preseason: weeks 0–3
- Regular season: weeks 0–22, **excluding week 21** (Pro Bowl — no data)
- Week index is 0-based; display week = weekIndex + 1

### Team Roster Parameters

For a specific team:
```json
{ "leagueId": <id>, "listIndex": <teamIndex>, "returnFreeAgents": false, "teamId": <teamId> }
```

For free agents:
```json
{ "leagueId": <id>, "listIndex": -1, "returnFreeAgents": true, "teamId": 0 }
```

---

## Full Authentication Flow Summary

```
EA Login URL
    → user logs in, redirected to localhost with ?code=
Exchange code for access_token + refresh_token
    → GET tokeninfo for pid_id
    → GET entitlements for pid
    → GET personas for each entitlement pidUri
User selects a persona
    → GET persona-scoped auth code (manual redirect)
    → POST to exchange for persona access_token
POST to Blaze /authentication/login with persona access_token
    → receive sessionKey + blazeId
Use sessionKey for all league data:
    → POST /wal/mca/Process/${sessionKey}  (RPC: GetMyLeagues, GetLeagueHub)
    → POST /wal/mca/${exportType}/${sessionKey}  (stat/roster exports)
```
