#!/usr/bin/env node

const mineflayer = require('mineflayer');
const pvpPlugin = require('mineflayer-pvp').plugin;
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');

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
  },
  godlike: {
    name: 'godlike',
    scanIntervalMs: 450,
    reactionDelayRange: [45, 160],
    attackDurationMs: null,
    maintainSprint: true,
    advanced: {
      strafeIntervalMs: 650,
      jumpPulseMs: 220,
      jumpChance: 0.35,
      healThreshold: 14,
      healCooldownMs: 5500,
      aimHeightOffset: 1.3
    }
  }
};

const WEAPON_PRIORITY = [
  'netherite_sword',
  'diamond_sword',
  'iron_sword',
  'stone_sword',
  'golden_sword',
  'wooden_sword',
  'netherite_axe',
  'diamond_axe',
  'iron_axe',
  'stone_axe',
  'golden_axe',
  'wooden_axe'
];

const ARMOR_PRIORITY = {
  head: [
    'netherite_helmet',
    'diamond_helmet',
    'iron_helmet',
    'chainmail_helmet',
    'golden_helmet',
    'turtle_helmet',
    'leather_helmet'
  ],
  torso: [
    'netherite_chestplate',
    'diamond_chestplate',
    'iron_chestplate',
    'chainmail_chestplate',
    'golden_chestplate',
    'leather_chestplate'
  ],
  legs: [
    'netherite_leggings',
    'diamond_leggings',
    'iron_leggings',
    'chainmail_leggings',
    'golden_leggings',
    'leather_leggings'
  ],
  feet: [
    'netherite_boots',
    'diamond_boots',
    'iron_boots',
    'chainmail_boots',
    'golden_boots',
    'leather_boots'
  ]
};

const SHIELD_ITEMS = ['shield'];
const HEALING_SOUPS = [
  'mushroom_stew',
  'beetroot_soup',
  'rabbit_stew',
  'suspicious_stew'
];
const GOLDEN_APPLES = ['enchanted_golden_apple', 'golden_apple'];

function printUsage() {
  console.log(`Usage: node src/index.js -s <host[:port]> [options]\n\n` +
    'Options:\n' +
    '  -s                 Toggle easy difficulty when used alone. When followed by a value,\n' +
    '                     treats the value as the server address (host or host:port).\n' +
    '  -h                 Enable hard difficulty.\n' +
    '  -g                 Enable godlike difficulty with advanced combat routines.\n' +
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
      case '-g':
      case '--godlike': {
        config.difficulty = DIFFICULTY_PRESETS.godlike;
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
    version: false, // auto-detect
    hideErrors: true
  });

  bot.loadPlugin(pvpPlugin);
  bot.loadPlugin(pathfinder);

  const skippedBlockEntityChunks = new Set();

  const chunkKey = (x, z) => `${x},${z}`;

  const chunkWarningListener = (packet) => {
    if (!packet || !packet.blockEntities || packet.blockEntities.length === 0) {
      return;
    }

    if (bot.world.getColumn(packet.x, packet.z)) {
      return;
    }

    const key = chunkKey(packet.x, packet.z);
    if (skippedBlockEntityChunks.has(key)) {
      return;
    }

    skippedBlockEntityChunks.add(key);
    log(bot, `Skipping block entities for unloaded chunk at (${packet.x}, ${packet.z}).`);
  };

  bot._client.on('map_chunk', chunkWarningListener);

  const chunkLoadListener = (point) => {
    if (!point) {
      return;
    }

    const key = chunkKey(point.x, point.z);
    if (skippedBlockEntityChunks.delete(key)) {
      log(bot, `Chunk at (${point.x}, ${point.z}) is now loaded.`);
    }
  };

  bot.on('chunkColumnLoad', chunkLoadListener);

  bot.once('spawn', () => {
    setupMovements(bot);
    setupPvpLoop(bot, config.difficulty);
    setupAdvancedCombat(bot, config.difficulty);
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

  bot.once('end', () => {
    skippedBlockEntityChunks.clear();
    bot._client.removeListener('map_chunk', chunkWarningListener);
    bot.removeListener('chunkColumnLoad', chunkLoadListener);
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

function setupAdvancedCombat(bot, difficulty) {
  const advanced = difficulty.advanced;
  if (!advanced) {
    return;
  }

  let strafeDirection = 1;
  let strafeInterval = null;
  const healState = {
    inProgress: false,
    lastHeal: 0
  };
  let equipScheduled = false;

  const stopStrafe = () => {
    bot.setControlState('left', false);
    bot.setControlState('right', false);
    bot.setControlState('jump', false);
  };

  const scheduleEquip = () => {
    if (equipScheduled) {
      return;
    }
    equipScheduled = true;
    setTimeout(async () => {
      equipScheduled = false;
      try {
        await equipBestGear(bot);
      } catch (error) {
        log(bot, `Failed to optimise gear: ${error.message}`);
      }
    }, 0);
  };

  scheduleEquip();

  const strafeTick = () => {
    const target = bot.pvp.target;
    if (!target) {
      stopStrafe();
      return;
    }

    strafeDirection *= -1;
    const moveRight = strafeDirection > 0;
    bot.setControlState('right', moveRight);
    bot.setControlState('left', !moveRight);

    if (advanced.jumpChance && Math.random() < advanced.jumpChance) {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), advanced.jumpPulseMs || 200);
    }
  };

  strafeInterval = setInterval(strafeTick, advanced.strafeIntervalMs);

  const aimHandler = () => {
    const target = bot.pvp.target;
    if (!target || !target.position) {
      return;
    }

    const height = advanced.aimHeightOffset ?? target.height ?? 1.25;
    const aimPosition = target.position.plus(new Vec3(0, height, 0));
    bot.lookAt(aimPosition, true).catch(() => {});
  };

  const healListener = () => {
    attemptHeal(bot, advanced, healState)
      .then((result) => {
        if (result === 'soup') {
          setTimeout(scheduleEquip, 450);
        } else if (result === 'gapple') {
          setTimeout(scheduleEquip, 1900);
        }
      })
      .catch((error) => {
        log(bot, `Failed to heal: ${error.message}`);
      });
  };

  const collectListener = (collector) => {
    if (collector === bot.entity) {
      scheduleEquip();
    }
  };

  const deathListener = () => {
    stopStrafe();
    setTimeout(scheduleEquip, 600);
  };

  const respawnListener = () => {
    stopStrafe();
    setTimeout(scheduleEquip, 700);
  };

  bot.on('physicsTick', aimHandler);
  bot.on('health', healListener);
  bot.on('playerCollect', collectListener);
  bot.on('death', deathListener);
  bot.on('respawn', respawnListener);

  if (bot.inventory && typeof bot.inventory.on === 'function') {
    bot.inventory.on('updateSlot', scheduleEquip);
  }

  bot.once('end', () => {
    stopStrafe();
    if (strafeInterval) {
      clearInterval(strafeInterval);
    }
    bot.removeListener('physicsTick', aimHandler);
    bot.removeListener('health', healListener);
    bot.removeListener('playerCollect', collectListener);
    bot.removeListener('death', deathListener);
    bot.removeListener('respawn', respawnListener);
    if (bot.inventory && typeof bot.inventory.removeListener === 'function') {
      bot.inventory.removeListener('updateSlot', scheduleEquip);
    }
  });
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

async function equipBestGear(bot) {
  await equipBestItemForSlot(bot, WEAPON_PRIORITY, 'hand');
  await equipBestItemForSlot(bot, SHIELD_ITEMS, 'off-hand');
  await equipBestItemForSlot(bot, ARMOR_PRIORITY.head, 'head');
  await equipBestItemForSlot(bot, ARMOR_PRIORITY.torso, 'torso');
  await equipBestItemForSlot(bot, ARMOR_PRIORITY.legs, 'legs');
  await equipBestItemForSlot(bot, ARMOR_PRIORITY.feet, 'feet');
}

async function equipBestItemForSlot(bot, priorityList, destination) {
  if (!priorityList || priorityList.length === 0) {
    return;
  }

  const best = findBestInventoryItem(bot, priorityList);
  if (!best) {
    return;
  }

  const equipped = getEquippedItem(bot, destination);
  const equippedPriority = getItemPriority(priorityList, equipped);
  const candidatePriority = getItemPriority(priorityList, best);

  if (candidatePriority < equippedPriority) {
    try {
      await bot.equip(best, destination);
    } catch (error) {
      if (!/item is not in inventory/i.test(error.message)) {
        throw error;
      }
    }
  }
}

function getEquippedItem(bot, destination) {
  if (typeof bot.getEquipmentDestSlot !== 'function' || !bot.inventory) {
    return null;
  }

  const slot = bot.getEquipmentDestSlot(destination);
  if (slot == null) {
    return null;
  }

  return bot.inventory.slots?.[slot] ?? null;
}

function findBestInventoryItem(bot, priorityList) {
  if (!bot.inventory) {
    return null;
  }

  let bestItem = null;
  let bestPriority = Infinity;

  for (const item of bot.inventory.items()) {
    const priority = getItemPriority(priorityList, item);
    if (priority < bestPriority) {
      bestItem = item;
      bestPriority = priority;
    }
  }

  return bestItem;
}

function getItemPriority(priorityList, item) {
  if (!item) {
    return Infinity;
  }
  const index = priorityList.indexOf(item.name);
  return index === -1 ? Infinity : index;
}

async function attemptHeal(bot, advanced, state) {
  if (!bot.entity || bot.health <= 0) {
    return null;
  }

  if (bot.health >= advanced.healThreshold) {
    return null;
  }

  const now = Date.now();
  if (state.inProgress || now - state.lastHeal < advanced.healCooldownMs) {
    return null;
  }

  const soup = findItemByNames(bot, HEALING_SOUPS);
  const goldenApple = soup ? null : findItemByNames(bot, GOLDEN_APPLES);

  if (!soup && !goldenApple) {
    return null;
  }

  state.inProgress = true;

  try {
    if (soup) {
      await bot.equip(soup, 'hand');
      bot.activateItem();
      setTimeout(() => bot.deactivateItem(), 150);
      state.lastHeal = now;
      return 'soup';
    }

    await bot.equip(goldenApple, 'hand');
    bot.activateItem();
    setTimeout(() => bot.deactivateItem(), 1600);
    state.lastHeal = now;
    return 'gapple';
  } finally {
    const resetDelay = soup ? 600 : 2000;
    setTimeout(() => {
      state.inProgress = false;
    }, resetDelay);
  }
}

function findItemByNames(bot, names) {
  if (!bot.inventory) {
    return null;
  }

  for (const name of names) {
    const match = bot.inventory.items().find((item) => item.name === name);
    if (match) {
      return match;
    }
  }

  return null;
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

