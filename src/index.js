#!/usr/bin/env node

const mineflayer = require('mineflayer');
const pvpPlugin = require('mineflayer-pvp').plugin;
const { pathfinder, Movements } = require('mineflayer-pathfinder');

const DEFAULT_PORT = 25565;
const DEFAULT_USERNAME_PREFIX = 'KitPvPBot';
const MAX_SCAN_DISTANCE = 48; // blocks

const DIFFICULTY_PRESETS = {
  easy: {
    name: 'easy',
    scanIntervalMs: 3500,
    reactionDelayRange: [900, 2200],
    attackDurationMs: 4500,
    maintainSprint: false
  },
  hard: {
    name: 'hard',
    scanIntervalMs: 900,
    reactionDelayRange: [100, 350],
    attackDurationMs: null,
    maintainSprint: true
  }
};

function printUsage() {
  console.log(`Usage: node src/index.js -s <host[:port]> [options]\n\n` +
    'Options:\n' +
    '  -s                 Toggle easy difficulty when used alone. When followed by a value,\n' +
    '                     treats the value as the server address (host or host:port).\n' +
    '  -h                 Enable hard difficulty.\n' +
    '  -b <number>        Number of bots to spawn (default: 1).\n' +
    '  --server <value>   Alternative way to specify the server address.\n' +
    '  --help             Show this help message.\n');
}

function parseArgs(argv) {
  const config = {
    difficulty: DIFFICULTY_PRESETS.easy,
    bots: 1,
    server: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '-s': {
        const next = argv[i + 1];
        if (next && !next.startsWith('-')) {
          config.server = parseServer(next);
          i += 1;
        } else {
          config.difficulty = DIFFICULTY_PRESETS.easy;
        }
        break;
      }
      case '--server': {
        const next = argv[i + 1];
        if (!next || next.startsWith('-')) {
          throw new Error('Missing value for --server.');
        }
        config.server = parseServer(next);
        i += 1;
        break;
      }
      case '-h':
      case '--hard': {
        config.difficulty = DIFFICULTY_PRESETS.hard;
        break;
      }
      case '-b':
      case '--bots': {
        const next = argv[i + 1];
        if (!next || next.startsWith('-')) {
          throw new Error('Missing value for -b/--bots.');
        }
        const value = Number.parseInt(next, 10);
        if (Number.isNaN(value) || value <= 0) {
          throw new Error('The number of bots must be a positive integer.');
        }
        config.bots = value;
        i += 1;
        break;
      }
      case '--help':
      case '-?':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!config.server) {
    throw new Error('A server address is required. Use -s <host[:port]> to provide one.');
  }

  return config;
}

function parseServer(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Server address must be a non-empty string.');
  }

  const [hostPart, portPart] = raw.split(':');
  const host = hostPart?.trim();
  if (!host) {
    throw new Error('Server host is required.');
  }

  const result = { host, port: DEFAULT_PORT };
  if (portPart) {
    const parsedPort = Number.parseInt(portPart, 10);
    if (Number.isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
      throw new Error('Server port must be a number between 1 and 65535.');
    }
    result.port = parsedPort;
  }

  return result;
}

function createBot(index, config) {
  const username = `${DEFAULT_USERNAME_PREFIX}_${index + 1}_${Math.floor(Math.random() * 1000)}`;
  const bot = mineflayer.createBot({
    host: config.server.host,
    port: config.server.port,
    username,
    version: false // auto-detect
  });

  bot.loadPlugin(pvpPlugin);
  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    setupMovements(bot);
    setupPvpLoop(bot, config.difficulty);
    log(bot, `Connected to ${config.server.host}:${config.server.port} in ${config.difficulty.name} mode.`);
  });

  bot.on('kicked', (reason) => {
    log(bot, `Kicked: ${reason}`);
  });

  bot.on('end', () => {
    log(bot, 'Disconnected from server.');
  });

  bot.on('error', (err) => {
    log(bot, `Encountered error: ${err.message}`);
  });

  return bot;
}

function setupMovements(bot) {
  if (!bot.pathfinder) {
    return;
  }

  const movements = new Movements(bot, bot.registry);
  movements.allow1by1towers = false;
  movements.allowParkour = true;
  movements.canDig = false;
  bot.pathfinder.setMovements(movements);
}

function setupPvpLoop(bot, difficulty) {
  const scanRadiusSq = MAX_SCAN_DISTANCE * MAX_SCAN_DISTANCE;
  let scheduledAttackTimeout = null;

  const scan = () => {
    if (!bot.entity) {
      return;
    }

    const target = findClosestPlayer(bot, scanRadiusSq);

    if (!target) {
      if (difficulty.maintainSprint) {
        bot.setControlState('sprint', false);
      }

      if (bot.pvp.target) {
        bot.pvp.stop();
      }
      return;
    }

    const delay = randomBetween(difficulty.reactionDelayRange[0], difficulty.reactionDelayRange[1]);

    if (scheduledAttackTimeout) {
      clearTimeout(scheduledAttackTimeout);
    }

    scheduledAttackTimeout = setTimeout(() => {
      if (!bot.entity) {
        return;
      }

      const refreshed = bot.players[target.username];
      if (!refreshed || !refreshed.entity) {
        return;
      }

      if (difficulty.maintainSprint) {
        bot.setControlState('sprint', true);
      }

      if (bot.pvp.target && bot.pvp.target !== refreshed.entity) {
        bot.pvp.stop();
      }

      if (!bot.pvp.target) {
        try {
          bot.pvp.attack(refreshed.entity);
          log(bot, `Engaging ${target.username} (${difficulty.name}).`);
        } catch (err) {
          log(bot, `Failed to attack ${target.username}: ${err.message}`);
        }
      }

      if (difficulty.attackDurationMs) {
        setTimeout(() => {
          if (bot.pvp.target === refreshed.entity) {
            bot.pvp.stop();
            if (difficulty.maintainSprint) {
              bot.setControlState('sprint', false);
            }
          }
        }, difficulty.attackDurationMs);
      }
    }, delay);
  };

  const interval = setInterval(scan, difficulty.scanIntervalMs);
  bot.once('end', () => {
    clearInterval(interval);
    if (scheduledAttackTimeout) {
      clearTimeout(scheduledAttackTimeout);
    }
  });
}

function findClosestPlayer(bot, maxDistanceSq) {
  if (!bot.players || !bot.entity) {
    return null;
  }

  let closest = null;
  let closestDistance = Infinity;

  for (const [username, player] of Object.entries(bot.players)) {
    if (!player || username === bot.username || !player.entity) {
      continue;
    }

    const distanceSq = bot.entity.position.distanceSquared(player.entity.position);
    if (distanceSq < closestDistance && distanceSq <= maxDistanceSq) {
      closest = { username, entity: player.entity };
      closestDistance = distanceSq;
    }
  }

  return closest;
}

function randomBetween(min, max) {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return lower + Math.random() * (upper - lower);
}

function log(bot, message) {
  console.log(`[${bot.username}] ${message}`);
}

function main() {
  try {
    const config = parseArgs(process.argv);
    for (let i = 0; i < config.bots; i += 1) {
      setTimeout(() => createBot(i, config), i * 750);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    printUsage();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

