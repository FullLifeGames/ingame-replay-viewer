// Helpers for the saved replay's specs: Showdown's saved shapes of a replay, built from its JSON.
// The shapes follow what Showdown writes; no saved file joins the tree (#56).
import type { Replay } from './replay'

/** The log's lines as Showdown's client keeps them: no newline after the last. */
function stepQueue(replay: Replay): string {
  return replay.log.endsWith('\n') ? replay.log.slice(0, -1) : replay.log
}

/**
 * The file of Showdown's "Download replay" (`BattleLog.createReplayFile`): the `replayid` input,
 * the data element with every "/" written as "\/", then the rendered log, whose decoy `|turn|`
 * line a reader must never take, and the script that loads the player.
 */
export function downloadedFile(replay: Replay): string {
  const data = stepQueue(replay).replaceAll('/', '\\/')
  return [
    '<!DOCTYPE html>',
    '<meta charset="utf-8" />',
    '<!-- version 1 -->',
    `<title>${replay.format} replay</title>`,
    '<div class="wrapper replay-wrapper">',
    `<input type="hidden" name="replayid" value="${replay.id}" />`,
    '<div class="battle"></div><div class="battle-log"></div><div class="replay-controls"></div>',
    `<script type="text/plain" class="battle-log-data">${data}</script>`,
    '</div>',
    '<div class="battle-log battle-log-inline"><div class="inner">',
    '<div class="battle-history">|turn|99</div>',
    '</div></div>',
    '<script>',
    "document.write('<script src=\"replay-embed.js\"></'+'script>');",
    '</script>',
    '',
  ].join('\n')
}

/**
 * The replay page as a browser saves it: a script of its own first, then the `class="log"`
 * element named after the replay, whose text holds the log with one newline more at each end.
 */
export function replayPage(replay: Replay): string {
  return [
    '<!DOCTYPE html>',
    '<html><head>',
    `<title>${replay.format}: ${replay.players.join(' vs. ')} - Replays</title>`,
    '<script>',
    'window.dataLayer = window.dataLayer || [];',
    '</script>',
    '<script defer src="//play.example/js/battle.js"></script>',
    '</head><body>',
    '<div class="wrapper replay-wrapper">',
    `<script type="text/plain" class="log" id="replaylog-${replay.id}">`,
    replay.log,
    '</script>',
    '</div>',
    '</body></html>',
    '',
  ].join('\n')
}

/** A battle log as a file: the log's text, nothing around it. */
export function rawLog(replay: Replay): string {
  return replay.log
}

/** A replay's JSON file, as Showdown serves it at `<id>.json`. */
export function jsonFile(replay: Replay): string {
  return JSON.stringify(replay, undefined, 2)
}
