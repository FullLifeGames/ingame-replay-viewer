# Sound samples skip after a run at Fast reaches END

This is the written diagnosis of #94. Testers in waves 4 and 5 saw the viewer's progress line count skipped sound samples right after a run at Fast reached END, 763,088 on the random battle. This page shows how to reproduce the skip and gives the counts per phase. It follows one skipped sample to its counter, names the cause and proposes the fix. The fix lands under an issue of its own.

Each statement of the cause carries a mark: **P** where the named code or a run's figure proves it, **I** where it follows from them without a measurement of its own, **U** where nobody knows yet.

## How to reproduce it

`npm run wasm:sound-phases` (`scripts/wasm-sound-phases.ts`) plays a stream on the viewer in headless Chromium at each speed asked for. It reads the page's test hook (`irvWasmViewer.status()`) after every draw of the page and prints the counts per phase. It starts no server. It needs the viewer's production build at `--url`, the module's build outputs that the page fetches, and your US Emerald where the build looks for it (`IRV_BASE_ROM`).

```sh
npm run build && npm run preview          # in a second shell; vite preview listens on port 4173
npm run wasm:sound-phases -- --speeds fast,1x --stall 200   # the skip at END, and 1x beside it
npm run wasm:sound-phases                 # hand-made at 1x, 2x and fast, 10 s past END each
npm run wasm:sound-phases -- --replay gen3randombattle-2717609379 --speeds fast
npm run wasm:sound-phases -- --speeds fast,2x --switch 1x@1000 --stall 300
```

- `--replay` takes `hand-made` (the default, played through the hook) or an example replay's id (picked in the list and started with Start).
- `--speeds` lists the speeds, one run each, in one browser.
- `--switch 1x@1000` marks the run at a speed switch instead of END: at frame 1000 the probe clicks the 1x radio right after a draw, where the page itself switches at END.
- `--stall 200` holds the page's main thread for 200 ms after the draw that marks the run, so the page's next draw comes that much later, as on a loaded machine. On a quiet machine the skip at END shows only with a stall (below).
- `--after` sets the seconds read past the mark (10), `--window` the length of the phase "at" (2 s), `--samples <file>` writes every reading as JSON.

The phases: "before" runs from the run's first draw to the first draw that sees END (or the switch), "at" covers the 2 s after it, and "after" the rest. Each phase starts on the last reading of the one before, so the counts add up. Per phase the script prints the wall time, the frames, the samples written into the ring, read from it, played (read less skipped) and skipped, the overruns and underruns, the ring's largest and last fill, the most frames the game advanced between two draws (`stepMax`), the longest time between two draws (`gapMax`), and the audio context's clock against the wall clock (`clockRatio`). Samples count left and right apart; one frame of sound is 1408 samples.

## The counts

The build machine ran these on one checkout, through the queue that keeps heavy runs apart. Wall-clock figures there depend on the load, so each run names its load average (1, 5, 15 minutes).

hand-made at each speed, 10 s past END (load 7.9 at the start, 3.2 at the end):

| Speed | Phase  | ms     | Frames | Written   | Read      | Skipped | Overruns | Underruns | Fill max | Step max | Gap max | Audio clock |
| ----- | ------ | ------ | ------ | --------- | --------- | ------- | -------- | --------- | -------- | -------- | ------- | ----------- |
| 1x    | before | 48,834 | 2,917  | 4,107,136 | 4,092,044 | 55,310  | 0        | 0         | 19,452   | 7        | 288 ms  | 0.985       |
| 1x    | at     | 1,995  | 119    | 167,552   | 168,176   | 0       | 0        | 0         | 15,616   | 2        | 32 ms   | 1.002       |
| 1x    | after  | 8,016  | 478    | 673,024   | 680,396   | 8,422   | 0        | 0         | 16,282   | 2        | 64 ms   | 0.997       |
| 2x    | before | 24,417 | 2,916  | 2,052,864 | 2,040,140 | 17,622  | 0        | 0         | 15,732   | 9        | 50 ms   | 0.989       |
| 2x    | at     | 1,999  | 237    | 167,552   | 167,444   | 0       | 0        | 0         | 13,556   | 2        | 28 ms   | 0.996       |
| 2x    | after  | 8,016  | 959    | 674,432   | 679,808   | 8,810   | 0        | 0         | 15,840   | 6        | 41 ms   | 0.995       |
| fast  | before | 6,533  | 2,921  | 0         | 0         | 0       | 0        | 0         | 0        | 12       | 26 ms   | 1.001       |
| fast  | at     | 2,000  | 119    | 167,552   | 165,718   | 0       | 0        | 1         | 11,692   | 9        | 20 ms   | 1.000       |
| fast  | after  | 8,018  | 479    | 674,432   | 672,366   | 0       | 0        | 1         | 4,070    | 2        | 23 ms   | 0.998       |

The draw that sees END at fast, and the ones after it (hand-made, the same run):

| Draw     | ms after start | Frame | Speed | Written | Waiting | Underruns |
| -------- | -------------- | ----- | ----- | ------- | ------- | --------- |
| END      | 6,544.2        | 2,921 | 1x    | 0       | 0       | 0         |
| next     | 6,560.7        | 2,930 | 1x    | 12,672  | 11,692  | 0         |
| 7 later  | 6,676.9        | 2,930 | 1x    | 12,672  | 1,686   | 0         |
| 8 later  | 6,693.3        | 2,930 | 1x    | 12,672  | 0       | 1         |
| 10 later | 6,726.9        | 2,931 | 1x    | 14,080  | 1,408   | 1         |

A switch inside a draw, with the main thread held 300 ms after it (hand-made, `--switch 1x@1000 --stall 300`, load 3.3 to 2.4):

| From | Phase | ms    | Frames | Written | Skipped | Overruns | Underruns | Step max | Gap max |
| ---- | ----- | ----- | ------ | ------- | ------- | -------- | --------- | -------- | ------- |
| fast | at    | 1,983 | 144    | 202,752 | 162,890 | 0        | 1         | 143      | 304 ms  |
| 2x   | at    | 1,984 | 118    | 166,144 | 10,022  | 0        | 1         | 8        | 303 ms  |

The random battle at fast, 10 s past END (load 3.2 at the start, 2.1 at the end; 9 minutes):

| Phase  | ms      | Frames  | Written | Read    | Skipped | Overruns | Underruns | Fill max | Step max | Gap max | Audio clock |
| ------ | ------- | ------- | ------- | ------- | ------- | -------- | --------- | -------- | -------- | ------- | ----------- |
| before | 522,247 | 244,575 | 0       | 0       | 0       | 0        | 0         | 0        | 63       | 215 ms  | 0.987       |
| at     | 1,998   | 119     | 167,552 | 165,042 | 0       | 0        | 1         | 9,552    | 7        | 20 ms   | 1.001       |
| after  | 8,015   | 479     | 674,432 | 674,416 | 0       | 0        | 0         | 3,498    | 2        | 22 ms   | 1.001       |

The worker ran 477 frames per second at fast. In the 14.5 ms after the END draw it ran 8 frames and wrote 11,264 samples, then stood still for 9 draws, and the ring ran dry once. Wave 5's tester counted 763,088 skips on this replay. That run played a stretch at 1x with 147 pictures before END and read the page around END on a loaded machine (`docs/waves/wave-05.md`); on a quiet machine with no pictures the skip at END does not come back without a stall.

The draw after END held 200 ms (hand-made, `--speeds fast,1x --stall 200`; another run loaded the machine, load 6.4 to 6.5):

| Speed | Phase | ms    | Frames | Written | Skipped | Overruns | Underruns | Step max | Gap max |
| ----- | ----- | ----- | ------ | ------- | ------- | -------- | --------- | -------- | ------- |
| fast  | at    | 1,982 | 118    | 166,144 | 105,258 | 0        | 1         | 96       | 204 ms  |
| fast  | after | 8,034 | 480    | 675,840 | 0       | 0        | 1         | 2        | 34 ms   |
| 1x    | at    | 1,998 | 120    | 168,960 | 9,290   | 0        | 1         | 6        | 214 ms  |
| 1x    | after | 8,012 | 479    | 674,432 | 0       | 0        | 0         | 2        | 31 ms   |

At fast the frame went from 2,917 to 3,013 in the held gap, 135,168 samples went in, and the trim skipped 105,258 at once: the size of stage 2's 130,878 skips after 993907's END. At 1x the same hold let no frame run ahead. The ring ran dry during the hold, and the frames the clock owed after it skipped 9,290.

How load enters: the first three runs had a load average of 2 to 4, this one 6.4. All four show the same burst and stall after the page leaves fast, with 1,408 samples per frame of the burst. The load changes only the time to the next draw, and with it the burst's size. A held main thread gives the same result as a loaded one, so the stall is the way to reproduce the skip on a quiet machine.

## Where the samples go

One sample on its way from the module's mixer to the counter that counts it as skipped:

1. The module's mixer ends each frame's mix in `HandOver` (`rom/gen3/wasm/layer/irv_mp2k_sound.c`), which calls `IrvSound_HandOver` (`rom/gen3/wasm/src/irv_wasm_sound.c`). That hands 704 pairs at 42,048 Hz to the worker's `irvAudio` through `IrvWasm_HandOverAudio`.
2. `irvAudio` is `audioHandler` (`src/web/wasm/audio.ts`, wired in `src/web/wasm/worker.ts`). It reads the pace word the page wrote (`readPace`, `src/web/wasm/protocol.ts`) on every frame, and `SoundPace.apply` keeps all 1408 samples at 1x, half of them at 2x and none at fast.
3. `AudioRing.push` (`src/web/wasm/ring.ts`) writes what fits into the shared ring and moves the written counter. A push that finds the ring full drops the rest and counts an overrun.
4. On the audio thread the worklet's `RingProcessor.process` (`src/web/wasm/audio-worklet.ts`) calls `RingReader.process` (`audio.ts`) once per render quantum. That calls `AudioRing.trim(AUDIO_LATENCY)` first: when more than 16,820 samples (0.2 s) wait, it moves the read counter past the oldest ones down to 8,410 (`trimFloor`) and adds them to the skipped counter (`ring.ts`, `trim`). This is where a sample is skipped and counted.
5. `Resampler.fill` then pulls and plays. When the ring runs dry while it plays, `runDry` counts one underrun and waits for a reserve of 2,816 samples.
6. The page reads the counters through `AudioRing` in `hookStatus` (`src/web/wasm/run.ts`) for the test hook, and in `progressLine` (`src/web/status.ts`) through `soundLine` (`audio.ts`) for the progress line under "Details".

No sample leaves the ring by another way: the read counter moves in `pull` and in `trim` only, and only `trim` adds to the skipped counter.

## The cause

At END the draw loop leaves fast for 1x and writes the 1x pace, but it keeps the worker's fast grant until its next draw. Until then the worker runs uncapped with its sound on. The ring takes in that burst faster than the audio clock plays it, so the trim skips the excess, and the worker then waits until the 1x clock catches up with it, so the ring runs dry.

1. **P** At fast the worker writes no sound. The pace at fast is 0 (`PACES`, `protocol.ts` line 35), `SoundPace.apply` returns no samples at pace 0 (`audio.ts` line 41), and every run at fast wrote 0 samples before END.
2. **P** In the draw that sees END, the grant comes first: `grant(run.control, run.clock.allowed(now, status.frame))` (`src/web/wasm/main.ts` line 94). At fast `allowed` returns undefined, so `grant` sets the fast word to 1 (`protocol.ts` line 98).
3. **P** Then `reachEnd` returns 1x (`speedAtEnd`, `protocol.ts` line 26) and `changeSpeed` runs (`main.ts` lines 182 to 187): `run.clock.change(...)` and `writePace(run.control, speed)`. It writes no grant, so the fast word stays 1 until the next draw.
4. **P** While the fast word is 1, `waitForTick` returns at once (`protocol.ts` line 110), so the worker plays frame after frame, and each frame's sound now goes into the ring at pace 1. In the run above, the frame went from 2,921 to 2,930 in the 16.5 ms to the next draw, and 12,672 samples (9 frames) went in.
5. **P** The next draw grants by the 1x clock, which `change` started at the frame read at the switch (`clock.ts`, `change` and `allowed`). The grant is lower than the frame the worker reached, so `waitForTick(control, frame)` (`src/web/wasm/game.ts` line 96) holds it until the clock catches up: 9 draws, 150 ms, with no frame and no sound. The worklet played the burst, found the ring empty and counted one underrun.
6. **P** The burst's size is the worker's speed at fast (457 frames per second in that run) times the time to the page's next draw. A burst over the latency cap is trimmed: with the main thread held 300 ms after the switch, the worker ran 143 frames, wrote 202,752 samples, and the trim skipped 162,890 at once. A switch from 2x to 1x with the same hold skipped 10,022: the 2x grant held the worker at 2 frames, and the 1x clock's owed frames came after the hold as the clock allows (`clock.ts`, `OWED_SECONDS`).
7. **P** The same happens at every switch from fast to 1x or 2x, not at END alone: the radio's change handler calls the same `changeSpeed` (`main.ts` line 307). The switch run above shows it at frame 1000.
8. **P** A late draw after END turns the burst into the testers' counts. On a quiet machine the gap is one display frame and the burst stays under the cap: no skip, one underrun (hand-made and the random battle). With the draw after END held 200 ms, the worker ran 96 frames and the trim skipped 105,258 samples at once.
9. **I** The testers' runs had such gaps: they read the page and took pictures around END on a loaded machine. Stage 2's 130,878 skips after 993907's END fit a gap of about 0.2 s. Nobody measured those runs' draw gaps. The 437,988 skips before END on the random battle come from that run's switch from fast to 1x at instruction 121, the same burst, and from its stretch at 1x with 147 pictures, not from END.
10. **P** A second, separate source of skips runs in every phase at 1x and 2x: headless Chromium's audio clock runs slow under load (0.985 of the wall clock over hand-made at 1x), the ring fills past the cap, and the trim holds it. Over hand-made at 1x that made 55,310 skips before END. It is not tied to END and needs no fast run (`docs/wasm-spike.md`, "Timing").
11. **U** How large the burst gets on a phone, where the worker's speed at fast and the page's draw rate differ.

## Proposal for the fix

The issue text for the next gate:

> **Hold the worker to the new speed at once when the page leaves Fast**
>
> At END and at every switch from Fast to 1x or 2x, the page writes the new pace but keeps the fast grant until its next draw. Until then the worker runs uncapped with its sound on, the worklet skips the burst past its latency cap, and then the worker waits until the clock catches up, so the sound runs dry once (`docs/sound-skip.md`).
>
> ## What it changes
>
> - A speed change grants the new speed's frames at once. Leaving fast, it writes the grant before the pace, so the worker stops at the frame of the switch before its sound turns on. Entering fast, it writes the pace before it lifts the grant.
> - The rule lives in one DOM-free function with its spec; `changeSpeed` in `src/web/wasm/main.ts` calls it, so END and the speed radio share it.
>
> ## Acceptance criteria
>
> - [ ] A red unit spec first: after a change from fast to 1x the control words hold the fast word at 0, a grant at the frame of the switch and the pace 1; after a change to fast the pace is 0.
> - [ ] A browser test switches hand-made from Fast to 1x at a frame with the main thread held 300 ms: the game advances at most 2 frames in the held gap (143 before the fix).
> - [ ] `npm run wasm:sound-phases -- --speeds fast,1x --stall 200` shows a frame step of 2 at most in the 2 s after END at fast, and no more skips there than at 1x (105,258 against 9,290 before the fix).
> - [ ] On a quiet machine, `npm run wasm:sound-phases -- --speeds fast` counts no underrun in the 2 s after END (1 before the fix).
> - [ ] A pause stays a pause across a speed change.
>
> ## Leaves out, and reversal
>
> The skips from headless Chromium's slow audio clock, which a resampler that follows the fill would remove (`docs/wasm-spike.md`). The burst of owed frames after a long main-thread stall at 1x, which the tick rule allows on purpose. The sound on real devices (#47). Reversal: one function and its call.
>
> ## Origin and size
>
> - From the diagnosis of #94 (`docs/sound-skip.md`).
> - Size: a small fix, one builder step: about 15 lines of code, one spec and one step in the browser test.

## The fix (#104)

A speed change now grants the new speed's frames at once (`changeSpeed` in `src/web/wasm/speed-change.ts`, which END and the speed radio share). Leaving fast, it writes the grant before the pace, so the worker stops at the frame of the switch before its sound turns on; entering fast, it writes the pace before it lifts the grant.

The build machine, with 6 shared cores, ran the base (c890e22, the commit before the fix) and the fix (fe4df39) in turn, each from its own production build, on hand-made with the mark at END. Another workload on the machine kept the 1-minute load average between 8.5 and 11.6 through every run, so no run was quiet. Each row names the 1-minute load the script printed at the end of its case.

The draw after END held 200 ms (`--speeds fast,1x --stall 200`), phase "at", base and fix three times each, in the order base, fix:

| Run    | Speed | Load  | ms    | Frames | Written | Skipped | Overruns | Underruns | Step max | Gap max |
| ------ | ----- | ----- | ----- | ------ | ------- | ------- | -------- | --------- | -------- | ------- |
| base 1 | fast  | 10.22 | 2,000 | 119    | 166,144 | 119,094 | 0        | 1         | 109      | 208 ms  |
| base 1 | 1x    | 8.91  | 1,998 | 119    | 167,552 | 8,558   | 0        | 1         | 5        | 211 ms  |
| fix 1  | fast  | 9.32  | 1,996 | 118    | 166,144 | 8,440   | 0        | 0         | 8        | 205 ms  |
| fix 1  | 1x    | 8.51  | 1,997 | 120    | 168,960 | 9,290   | 0        | 1         | 6        | 207 ms  |
| base 2 | fast  | 8.88  | 1,997 | 118    | 166,144 | 83,160  | 0        | 1         | 77       | 207 ms  |
| base 2 | 1x    | 9.23  | 2,000 | 120    | 168,960 | 9,722   | 0        | 1         | 5        | 210 ms  |
| fix 2  | fast  | 9.60  | 1,999 | 119    | 167,552 | 8,932   | 0        | 0         | 5        | 205 ms  |
| fix 2  | 1x    | 8.89  | 1,999 | 119    | 167,552 | 8,858   | 0        | 1         | 8        | 209 ms  |
| base 3 | fast  | 11.64 | 1,999 | 118    | 166,144 | 63,448  | 0        | 1         | 63       | 205 ms  |
| base 3 | 1x    | 8.83  | 1,997 | 119    | 167,552 | 9,290   | 0        | 1         | 5        | 210 ms  |
| fix 3  | fast  | 9.51  | 1,997 | 118    | 166,144 | 8,614   | 0        | 0         | 8        | 210 ms  |
| fix 3  | 1x    | 9.72  | 1,999 | 120    | 168,960 | 10,266  | 0        | 1         | 5        | 210 ms  |

The held gap itself, from END's draw to the first draw after the hold (the third pair, read from `--samples`):

| Run    | Speed | Frame at END | Frame after | Step | ms    | Written | Skipped |
| ------ | ----- | ------------ | ----------- | ---- | ----- | ------- | ------- |
| base 3 | fast  | 2,919        | 2,982       | 63   | 204.7 | 90,112  | 63,448  |
| fix 3  | fast  | 2,918        | 2,919       | 1    | 210.4 | 1,408   | 0       |
| base 3 | 1x    | 2,916        | 2,917       | 1    | 209.8 | 1,408   | 0       |
| fix 3  | 1x    | 2,916        | 2,917       | 1    | 210.0 | 1,408   | 0       |

No hold (`--speeds fast`), phase "at", and the underruns of the phase "after" beside it, in the order base, fix, base, fix:

| Run    | Load  | ms    | Frames | Written | Skipped | Overruns | Underruns | Step max | Gap max | Underruns after |
| ------ | ----- | ----- | ------ | ------- | ------- | -------- | --------- | -------- | ------- | --------------- |
| base 1 | 9.38  | 1,998 | 119    | 167,552 | 0       | 0        | 1         | 7        | 23 ms   | 0               |
| fix 1  | 9.54  | 1,983 | 118    | 166,144 | 0       | 0        | 0         | 1        | 26 ms   | 0               |
| base 2 | 10.10 | 1,998 | 119    | 167,552 | 0       | 0        | 1         | 7        | 30 ms   | 0               |
| fix 2  | 9.08  | 1,999 | 119    | 167,552 | 0       | 0        | 0         | 1        | 22 ms   | 1               |

What the figures show against #104's criteria:

- **The held gap holds.** With the fix the game advances 1 frame at fast while the draw after END waits 210 ms, as at 1x; the base ran 63 frames there and skipped 63,448 samples at once.
- **The step max over the 2 s window** stays at 5 to 8 with the fix at fast, and at 5 to 8 at 1x in base and fix alike. These are the frames the 1x clock owes after the hold and pays in the next draws (`clock.ts`, `OWED_SECONDS`), which #104 leaves out on purpose. In the fix's third run the step after the hold went 1, 1, 8, 3, then 1 per draw.
- **The skips hold.** The fix skips 8,440, 8,932 and 8,614 at fast, within the 1x runs' range of 8,558 to 10,266; the base's burst of 63,448 to 119,094 is gone. In its second run the fix skipped 74 samples more at fast (8,932) than at 1x (8,858) in the same browser.
- **The underruns stay open.** Without a hold the fix counts no underrun in the 2 s after END at fast, where the base counts 1 in each run. The criterion asks for a quiet machine, and no run was quiet. The fix's second run counted 1 underrun later, in the phase "after".
