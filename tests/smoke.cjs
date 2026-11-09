const { _electron } = require("@playwright/test");
const path = require("node:path");
(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: process.env.MENGSHU_EXE,
    args: [
      ...(process.env.MENGSHU_EXE ? [] : [path.resolve("out/main/index.js")]),
      "--smoke",
    ],
    env,
    timeout: 30000,
  });
  let closed = false;
  app.on("close", () => (closed = true));
  app.process().stderr.on("data", (s) => process.stderr.write(s));
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    if ((await app.windows()).length !== 1)
      throw Error("Unexpected settings/taskbar window");
    const state = await page.evaluate(() => window.mengshu.snapshot());
    console.log("state", state);
    if (state.desktopError || state.inputError)
      throw Error("Native startup failed");
    const greeting = "人好喵~我素懵薯！我树薯薯养的键盘喵喵。";
    if (
      state.speech !== greeting ||
      (await page.locator(".pet-speech").textContent()) !== greeting
    )
      throw Error("Startup must show the exact welcome message");
    const greetingRemaining = state.speechUntil - Date.now();
    if (greetingRemaining < 5000 || greetingRemaining > 10000)
      throw Error("Startup welcome must use a ten-second timer");
    await page.evaluate(() => {
      window.mengshu.interact("pet");
      window.mengshu.interact("pet");
    });
    await page.waitForTimeout(100);
    const greetingAfterClicks = await page.evaluate(() =>
      window.mengshu.snapshot(),
    );
    if (
      greetingAfterClicks.speech !== greeting ||
      greetingAfterClicks.speechUntil !== state.speechUntil
    )
      throw Error(
        "Cat clicks must not replace or extend the ten-second welcome",
      );
    await page.screenshot({
      path: "docs/startup-preview.png",
      omitBackground: true,
    });
    await page.waitForTimeout(
      Math.max(0, state.speechUntil - Date.now() - 250),
    );
    if ((await page.locator(".pet-speech").textContent()) !== greeting)
      throw Error("Startup welcome must remain visible until its timer ends");
    await page.waitForFunction(
      () => !document.querySelector(".pet-speech"),
      null,
      { timeout: 1500 },
    );
    // The desktop is click-through, so the sound must work without a user gesture.
    await page.evaluate(() => {
      window.__meowAudio = null;
      window.__meowCount = 0;
      window.__meowEvents = 0;
      window.mengshu.meow(() => {
        window.__meowEvents++;
      });
      const original = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function (...args) {
        window.__meowAudio = this;
        window.__meowCount++;
        return original.apply(this, args);
      };
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send("meow"),
    );
    await page.waitForFunction(() => window.__meowAudio?.state === "running");
    if (!process.env.MENGSHU_EXE) {
      const { readdirSync } = require("node:fs");
      const { pathToFileURL } = require("node:url");
      const assets = path.resolve("out/renderer/assets");
      const urls = readdirSync(assets)
        .filter((name) => /^(meow|dog|other)-.*\.mp3$/.test(name))
        .map((name) => pathToFileURL(path.join(assets, name)).href);
      if (urls.length !== 39)
        throw Error("Build must include all 39 animal recordings");
      const durations = await page.evaluate(async (urls) => {
        const context = new AudioContext();
        try {
          return await Promise.all(
            urls.map(async (url) => {
              const response = await fetch(url);
              const buffer = await context.decodeAudioData(
                await response.arrayBuffer(),
              );
              if (
                !buffer
                  .getChannelData(0)
                  .some((sample) => Math.abs(sample) > 0.0001)
              )
                throw Error("Silent cat recording: " + url);
              return buffer.duration;
            }),
          );
        } finally {
          await context.close();
        }
      }, urls);
      if (durations.some((duration) => duration < 0.3 || duration > 4))
        throw Error("Animal recordings must be short and decodable");
      console.log(
        "decoded mixed animal clips",
        durations.length,
        "duration range",
        Math.min(...durations),
        Math.max(...durations),
      );
    }
    const bounds = await app.evaluate(({ BrowserWindow, screen }) => ({
      actual: BrowserWindow.getAllWindows()[0].getBounds(),
      primary: screen.getPrimaryDisplay().workArea,
    }));
    if (
      bounds.actual.x < bounds.primary.x ||
      Math.abs(bounds.actual.x + bounds.actual.width / 2 -
        (bounds.primary.x + bounds.primary.width * 5 / 8)) > 1
    )
      throw Error("Primary display placement failed");
    if (!(await page.locator("img.keyboard-art").count()))
      throw Error("Generated keyboard missing");
    const paws = await page.locator("img.paw").evaluateAll((images) =>
      images.map((img) => ({
        src: img.src,
        ready: img.complete && img.naturalWidth > 100,
      })),
    );
    if (
      paws.length !== 2 ||
      !paws.every((p) => p.ready) ||
      paws[0].src === paws[1].src
    )
      throw Error("Two distinct photo paw cutouts must be loaded");
    if (await page.locator(".mouse, .mouse-art, .mouse-feedback").count())
      throw Error("Mouse visuals must be removed");
    if ((await page.locator(".key").allTextContents()).some((s) => s.trim()))
      throw Error("Keyboard must use image legends");
    const metricLabels = await page.locator(".metric > span").allTextContents();
    if (metricLabels.join(",") !== "敲薯,今日工作")
      throw Error("Statistics must only show 敲薯 and today's work");
    const workTime = await page
      .locator(".metric")
      .nth(1)
      .locator("strong")
      .textContent();
    if (!/^\d+ 时 \d+ 分$/.test(workTime))
      throw Error("Today's work must use hours and minutes");
    const send = async (type) =>
      app.evaluate(
        ({ BrowserWindow }, e) =>
          BrowserWindow.getAllWindows()[0].webContents.send("input", e),
        type,
      );
    const click = async (selector, fx = 0.5, fy = 0.5) => {
      const b = await page.locator(selector).boundingBox();
      if (!b) throw Error("Missing " + selector);
      await app.evaluate(
        ({ BrowserWindow }, p) =>
          BrowserWindow.getAllWindows()[0].webContents.send("desktop-click", p),
        { x: b.x + b.width * fx, y: b.y + b.height * fy },
      );
      await page.waitForTimeout(120);
    };
    await page.evaluate(() => window.mengshu.update({ paused: true }));
    await page.waitForTimeout(250);
    await page.screenshot({
      path: "docs/rest-pose-preview.png",
      omitBackground: true,
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const idlePose = () =>
      page.locator(".cat, .paw").evaluateAll((images) =>
        images.map((img) => {
          const s = getComputedStyle(img);
          return {
            translate: s.translate,
            rotate: s.rotate,
            state: s.animationPlayState,
          };
        }),
      );
    const idleBefore = await idlePose();
    await page.waitForTimeout(750);
    const idleAfter = await idlePose();
    if (
      idleAfter.some(
        (pose, i) =>
          pose.state !== "running" ||
          (pose.translate === idleBefore[i].translate &&
            pose.rotate === idleBefore[i].rotate),
      )
    )
      throw Error("Cat and both paws must move gently while idle");
    const restLeft = await page
      .locator(".paw:not(.right)")
      .getAttribute("style");
    // Perspective is baked into the sprite, not a DOM transformation.
    if (
      await page
        .locator(".keyboard")
        .evaluate((el) => getComputedStyle(el).transform !== "none")
    )
      throw Error("Generated keyboard must not be CSS transformed");
    // Check reaches across measured image faces, including front corners.
    for (const [keycode, selector] of [
      [1, ".paw:not(.right)"],
      [29, ".paw:not(.right)"],
      [13, ".paw.right"],
      [83, ".paw.right"],
    ]) {
      await send({ type: "keydown", keycode });
      await page.waitForTimeout(180);
      const offset = await page.evaluate(
        ({ keycode, selector }) => {
          const scene = document
            .querySelector(".scene")
            .getBoundingClientRect();
          const key = document
            .querySelector(`[data-key="${keycode}"]`)
            .getBoundingClientRect();
          const paw = document.querySelector(selector);
          const scale = scene.width / 1440;
          return (
            Math.hypot(
              scene.left +
                parseFloat(paw.style.left) * scale -
                (key.x + key.width / 2),
              scene.top +
                parseFloat(paw.style.top) * scale -
                (key.y + key.height / 2),
            ) / scale
          );
        },
        { keycode, selector },
      );
      if (offset > 2)
        throw Error(`Paw misses projected key ${keycode}: ${offset}px`);
      await send({ type: "keyup", keycode });
    }
    const angles = [];
    for (const keycode of [30, 20]) {
      await send({ type: "keydown", keycode });
      await page.waitForTimeout(150);
      const pose = await page.locator(".paw:not(.right)").evaluate((img) => ({
        transform: img.style.transform,
        idleState: getComputedStyle(img).animationPlayState,
      }));
      angles.push(pose.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1]);
      if (pose.idleState !== "paused")
        throw Error("Idle paw motion must pause while pressing");
      await send({ type: "keyup", keycode });
      await page.waitForTimeout(150);
    }
    if (!angles[0] || !angles[1] || angles[0] === angles[1])
      throw Error("Different key reaches must use different paw angles");
    if (
      (await page.locator(".paw:not(.right)").getAttribute("style")) !==
      restLeft
    )
      throw Error("Paw did not return to the resting R pose");
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (
      await page
        .locator(".cat, .paw")
        .evaluateAll((images) =>
          images.some((img) => getComputedStyle(img).animationName !== "none"),
        )
    )
      throw Error("Reduced motion must disable idle animations");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => window.dispatchEvent(new Event("reset-input")));
    const catRate = () =>
      page
        .locator(".cat")
        .evaluate((img) => img.getAnimations()[0]?.playbackRate);
    await send({ type: "keydown", keycode: 30 });
    for (let i = 0; i < 12; i++) await send({ type: "keydown", keycode: 30 });
    await page.waitForTimeout(650);
    const slowRate = await catRate();
    if (!(slowRate > 1 && slowRate < 1.6))
      throw Error("Holding a key must not inflate typing speed");
    await send({ type: "keyup", keycode: 30 });
    for (let i = 0; i < 12; i++) {
      await send({ type: "keydown", keycode: 30 });
      await send({ type: "keyup", keycode: 30 });
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(250);
    const fastRate = await catRate();
    if (!(fastRate > slowRate + 1))
      throw Error("Faster typing must speed up cat motion");
    const moveDuration = await page
      .locator(".paw")
      .first()
      .evaluate((img) => parseFloat(getComputedStyle(img).transitionDuration));
    if (!(moveDuration < 0.09))
      throw Error("Fast typing must make paw reaches quicker");
    await page.waitForTimeout(5000);
    if ((await catRate()) !== 1)
      throw Error("Cat must settle back to idle speed");
    console.log("motion tempo", { slowRate, fastRate, moveDuration });
    const beforeMove = await page.locator(".paw.right").getAttribute("style");
    await send({ type: "mousemove", x: 100, y: 100 });
    await send({ type: "wheel", x: 100, y: 100 });
    await page.waitForTimeout(300);
    if ((await page.locator(".paw.right").getAttribute("style")) !== beforeMove)
      throw Error("Movement moved paw");
    for (const button of [1, 2, 3]) {
      await send({ type: "mousedown", button });
      await page.waitForTimeout(300);
      if (
        (await page.locator(".paw.right").getAttribute("style")) !== beforeMove
      )
        throw Error("Mouse holds must not move paw");
      await send({ type: "mouseup", button });
    }
    await page.evaluate(() => window.mengshu.update({ paused: false }));
    await page.waitForTimeout(180);
    await page.screenshot({
      path: "docs/scene-preview.png",
      omitBackground: true,
    });

    const keyCount = (await page.evaluate(() => window.mengshu.snapshot()))
      .daily.keys;
    const toggle = async (down) =>
      app.evaluate(
        (_, down) =>
          process
            .getBuiltinModule("module")
            .createRequire(process.cwd() + "/package.json")("uiohook-napi")
            .uIOhook.keyToggle(42, down),
        down,
      );
    await toggle("down");
    try {
      await page.waitForTimeout(150);
      if (!(await page.locator(".key.pressed").count()))
        throw Error("Native key animation missing");
      await page.screenshot({
        path: "docs/keypress-preview.png",
        omitBackground: true,
      });
    } finally {
      await toggle("up");
    }
    await page.waitForTimeout(150);
    if (
      (await page.evaluate(() => window.mengshu.snapshot())).daily.keys <
      keyCount + 1
    )
      throw Error("Native key count missing");
    const catClickWithRandom = async (roll) => {
      await app.evaluate((_, roll) => {
        globalThis.__originalRandom = Math.random;
        Math.random = () => roll;
      }, roll);
      try {
        await click(".cat", 0.3, 0.4);
      } finally {
        await app.evaluate(() => {
          Math.random = globalThis.__originalRandom;
        });
      }
    };
    const meowsBeforePet = await page.evaluate(() => window.__meowCount);
    const petClickStarted = Date.now();
    await catClickWithRandom(0.219999);
    if (!(await page.locator(".pet-speech").count()))
      throw Error("Pet dialogue missing");
    const speechState = await page.evaluate(() => window.mengshu.snapshot());
    if (
      speechState.speechUntil < petClickStarted + 3000 ||
      speechState.speechUntil > Date.now() + 3000
    )
      throw Error("Pet dialogue must expire in 3 seconds");
    await catClickWithRandom(0.22);
    const speechAfterClick = await page.evaluate(() =>
      window.mengshu.snapshot(),
    );
    if (
      speechAfterClick.speech !== speechState.speech ||
      speechAfterClick.speechUntil !== speechState.speechUntil
    )
      throw Error(
        "Clicks must not replace active dialogue or restart its timer",
      );
    await page.waitForFunction(
      (before) => window.__meowCount === before + 1,
      meowsBeforePet,
    );
    await page.waitForFunction(
      () => !document.querySelector(".pet-speech"),
      null,
      { timeout: 3500 },
    );
    if ((await page.evaluate(() => window.__meowCount)) !== meowsBeforePet + 1)
      throw Error("Cat clicks at or above the 22% threshold must stay silent");
    if (await page.locator(".pet-speech").count())
      throw Error("Repeated clicks must not prolong the three-second bubble");
    await catClickWithRandom(0.22);
    await page.waitForSelector(".pet-speech");
    const eventsBeforeBlockedClick = await page.evaluate(
      () => window.__meowEvents,
    );
    await catClickWithRandom(0);
    if (
      (await page.evaluate(() => window.__meowEvents)) !==
      eventsBeforeBlockedClick
    )
      throw Error("A blocked cat click must not roll or emit a meow");
    if (
      (await page.evaluate(() => window.mengshu.snapshot())).speechUntil <=
      speechState.speechUntil
    )
      throw Error("A fresh click after expiry must allow new dialogue");
    if (await page.locator(".gear, .settings-menu").count())
      throw Error("Desktop gear and menu must be removed");
    await app.evaluate(({ Tray }) => {
      const original = Tray.prototype.setContextMenu;
      Tray.prototype.setContextMenu = function (menu) {
        globalThis.__tray = this;
        globalThis.__trayMenu = menu;
        return original.call(this, menu);
      };
    });
    const currentAutoStart = (
      await page.evaluate(() => window.mengshu.snapshot())
    ).settings.autoStart;
    await page.evaluate(
      (autoStart) => window.mengshu.update({ autoStart }),
      currentAutoStart,
    );
    const trayState = await app.evaluate(() => ({
      alive: !globalThis.__tray.isDestroyed(),
      bounds: globalThis.__tray.getBounds(),
      labels: globalThis.__trayMenu.items.map((item) => item.label),
    }));
    if (
      !trayState.alive ||
      trayState.bounds.width <= 0 ||
      trayState.labels.join(",") !== "开机自启,调试：连续工作 1h,退出"
    )
      throw Error("Native tray icon and settings menu must be available");
    const trayClick = (id) =>
      app.evaluate((_, id) => {
        const item = globalThis.__trayMenu.getMenuItemById(id);
        item.click(item, null, {});
      }, id);
    await catClickWithRandom(0.22);
    await page.waitForSelector(".pet-speech");
    const beforeDebug = await page.evaluate(() => window.mengshu.snapshot());
    const meowsBeforeReminder = await page.evaluate(() => window.__meowCount);
    await trayClick("debug-hour");
    await page.waitForSelector(".rest-speech");
    const afterDebug = await page.evaluate(() => window.mengshu.snapshot());
    if (
      (await page.locator(".speech").count()) !== 1 ||
      afterDebug.speech ||
      afterDebug.speechUntil
    )
      throw Error("Rest reminder must replace and discard the previous speech");
    if (
      !afterDebug.reminderText ||
      (await page.locator(".rest-message").textContent()) !==
        afterDebug.reminderText ||
      (await page.locator(".rest-dismiss").textContent()) !== "我知道了"
    )
      throw Error(
        "Rest reminder must show selected text and acknowledgement button",
      );
    const reminderRemaining = afterDebug.reminderUntil - Date.now();
    if (reminderRemaining < 1799000 || reminderRemaining > 1800000)
      throw Error(
        "Debug hour must trigger the regular 30-minute rest reminder",
      );
    if (
      afterDebug.daily.workMs - beforeDebug.daily.workMs > 5000 ||
      afterDebug.continuousMs - beforeDebug.continuousMs > 5000
    )
      throw Error("Debug hour must not inflate recorded work time");
    await page.waitForTimeout(1100);
    const eventsDuringReminder = await page.evaluate(() => window.__meowEvents);
    await catClickWithRandom(0);
    if (
      (await page.evaluate(() => window.__meowEvents)) !== eventsDuringReminder
    )
      throw Error("Clicking a cat during a reminder must not emit a meow");
    if (
      (await page.locator(".speech").count()) !== 1 ||
      (await page.locator(".rest-message").textContent()) !==
        afterDebug.reminderText ||
      (await page.evaluate(() => window.mengshu.snapshot())).speech
    )
      throw Error(
        "Pet speech must not interrupt or queue behind a rest reminder",
      );
    if ((await page.evaluate(() => window.__meowCount)) !== meowsBeforeReminder)
      throw Error("Rest reminder must stay silent until acknowledged");
    await page.screenshot({
      path: "docs/rest-reminder-preview.png",
      omitBackground: true,
    });
    await click(".rest-message");
    if (!(await page.locator(".rest-speech").count()))
      throw Error("Reminder text must remain visible until acknowledged");
    await click(".rest-dismiss");
    if (await page.locator(".rest-speech").count())
      throw Error("Acknowledgement button must close the rest reminder");
    if (await page.locator(".speech").count())
      throw Error("Dismissal must not restore stale lower-priority speech");
    await page.waitForFunction(
      (before) => window.__meowCount === before + 1,
      meowsBeforeReminder,
    );
    await page.evaluate(() => window.mengshu.interact("dismiss"));
    await page.waitForTimeout(150);
    if (
      (await page.evaluate(() => window.__meowCount)) !==
      meowsBeforeReminder + 1
    )
      throw Error("Repeated acknowledgement must not play another meow");
    const original = (await page.evaluate(() => window.mengshu.snapshot()))
      .settings.autoStart;
    for (const expected of [!original, original]) {
      await trayClick("autostart");
      if (
        (await page.evaluate(() => window.mengshu.snapshot())).settings
          .autoStart !== expected
      )
        throw Error("Tray autostart action must update settings");
      if (
        (await app.evaluate(
          () => globalThis.__trayMenu.getMenuItemById("autostart").checked,
        )) !== expected
      )
        throw Error("Tray checkbox must track the current autostart setting");
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].destroy(),
    );
    await new Promise((r) => setTimeout(r, 4000));
    if ((await app.windows()).length !== 1)
      throw Error("Desktop recovery failed");
    const recovered = (await app.windows())[0];
    await recovered.waitForLoadState("domcontentloaded");
    if (await recovered.locator(".pet-speech").count())
      throw Error("Desktop recovery must not repeat the startup welcome");
    if (await recovered.locator(".gear").count())
      throw Error("Recovery must not restore the gear");
    if (await app.evaluate(() => globalThis.__tray.isDestroyed()))
      throw Error("Tray must survive desktop recovery");
    const exit = app.waitForEvent("close");
    await trayClick("quit");
    await exit;
    console.log(
      "smoke passed: idle motion, key-dependent rotation, reduced motion, native input, native tray routing, debug rest reminder, persisted toggle, recovery, quit",
    );
  } finally {
    if (!closed) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
