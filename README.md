# kitpvpbot

A command-line utility for spinning up [Mineflayer](https://github.com/PrismarineJS/mineflayer) KitPvP practice bots. Configure the number of bots, pick an aggression preset, and point them at any Minecraft server you control.

## Prerequisites

- Node.js 18 or later (Mineflayer requires modern Node versions)
- Access to a Minecraft KitPvP server you are allowed to automate

> ⚠️ **Important:** Always confirm that you have permission to run automated clients on the target server. Many public servers forbid bots and can ban offending accounts/IPs.

## Installation

Clone the repository and install the dependencies:

```bash
npm install
```

The project exposes a binary named `kitpvpbot`. You can run it through `npm start` or directly with Node.js.

## Usage

```bash
node src/index.js -s <host[:port]> [options]
```

Short options can be combined with the arguments listed below:

| Option | Description |
| ------ | ----------- |
| `-s` | When provided without a value, forces the bot to use the *easy* preset. When followed by a value (e.g. `-s play.example.net:25565`) it is treated as the server address. |
| `-h` | Switches to the *hard* preset (faster reactions, sprinting). |
| `-g` | Enables the *godlike* preset with advanced combat behaviour (gear optimisation, strafing, clutch healing). |
| `-b <number>` | Number of bot instances to spawn. Defaults to `1`. |
| `--server <value>` | Alternative way to provide the server address if you want to keep the `-s` flag for toggling easy mode. |
| `--help` | Display CLI help text. |

Examples:

```bash
# Connect a single easy-mode bot to play.example.net:25565
node src/index.js -s play.example.net:25565

# Spawn 3 hard-mode bots on a LAN server
node src/index.js -s 192.168.1.50 -h -b 3

# Equivalent using the installed binary
npx kitpvpbot --server kitpvp.local:25570 -h -b 2

# Deploy an all-out godlike duelist on a local arena
node src/index.js --server 127.0.0.1:25565 -g
```

### Difficulty presets

- **Easy** – Slower reaction time, no sprinting, automatically disengages after short fights.
- **Hard** – Rapid retargeting, permanent sprinting while in combat, and minimal disengagement delays.
- **Godlike** – Everything in *Hard* plus live gear optimisation (auto-equipping the best weapon, armour, and shield), predictive strafing with jump resets, and automatic soup/gapple healing when health dips.

## Development

- `npm start` – run the CLI locally using Node.js.
- `npm test` – placeholder script (prints a message).

Pull requests are welcome! If you build new strategies or improvements, please make sure they are configurable via the command line.
