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
    const bounds = await app.evaluate(({ BrowserWindow, screen }) => ({
      actual: BrowserWindow.getAllWindows()[0].getBounds(),
      primary: screen.getPrimaryDisplay().workArea,
    }));
    if (
      bounds.actual.x < bounds.primary.x ||
      bounds.actual.x + bounds.actual.width >
        bounds.primary.x + bounds.primary.width
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
    await click(".cat", 0.3, 0.4);
    if (!(await page.locator(".pet-speech").count()))
      throw Error("Pet dialogue missing");
    const speechState = await page.evaluate(() => window.mengshu.snapshot());
    const remaining = speechState.speechUntil - Date.now();
    if (remaining < 2500 || remaining > 3000)
      throw Error("Pet dialogue must expire in 3 seconds");
    await page.waitForTimeout(1700);
    await click(".cat", 0.3, 0.4);
    await page.waitForTimeout(1700);
    if (!(await page.locator(".pet-speech").count()))
      throw Error("Clicking again must restart the 3-second speech timer");
    await page.waitForFunction(
      () => !document.querySelector(".pet-speech"),
      null,
      { timeout: 1700 },
    );
    await click(".gear");
    if (!(await page.locator("[role=menu]").count()))
      throw Error("Gear menu did not open");
    const labels = await page.locator("[role=menu] button").allTextContents();
    if (
      labels.length !== 3 ||
      !labels[0].includes("开机自启") ||
      labels[1] !== "调试：连续工作 1h" ||
      labels[2] !== "退出"
    )
      throw Error("Settings must contain autostart, debug hour and quit");
    await page.screenshot({
      path: "docs/settings-preview.png",
      omitBackground: true,
    });
    const beforeDebug = await page.evaluate(() => window.mengshu.snapshot());
    await click("[data-action=debug-hour]");
    await page.waitForSelector(".rest-speech");
    const afterDebug = await page.evaluate(() => window.mengshu.snapshot());
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
    if (await page.locator("[role=menu]").count())
      throw Error("Debug action must close the settings menu");
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
    await click(".gear");
    const original = (await page.evaluate(() => window.mengshu.snapshot()))
      .settings.autoStart;
    await click("[data-action=autostart]");
    await page.waitForFunction(
      (value) =>
        document
          .querySelector("[role=menuitemcheckbox]")
          ?.getAttribute("aria-checked") === String(!value),
      original,
    );
    if (
      (await page.evaluate(() => window.mengshu.snapshot())).settings
        .autoStart === original
    )
      throw Error("Autostart toggle failed");
    await click("[data-action=autostart]");
    await page.waitForFunction(
      (value) =>
        document
          .querySelector("[role=menuitemcheckbox]")
          ?.getAttribute("aria-checked") === String(value),
      original,
    );
    await click(".gear");
    if (await page.locator("[role=menu]").count())
      throw Error("Gear menu did not close");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].destroy(),
    );
    await new Promise((r) => setTimeout(r, 4000));
    if ((await app.windows()).length !== 1)
      throw Error("Desktop recovery failed");
    const recovered = (await app.windows())[0];
    await recovered.waitForLoadState("domcontentloaded");
    const b = await recovered.locator(".gear").boundingBox();
    await app.evaluate(
      ({ BrowserWindow }, p) =>
        BrowserWindow.getAllWindows()[0].webContents.send("desktop-click", p),
      { x: b.x + b.width / 2, y: b.y + b.height / 2 },
    );
    await recovered.waitForSelector("[data-action=quit]");
    const q = await recovered.locator("[data-action=quit]").boundingBox();
    const exit = app.waitForEvent("close");
    await app.evaluate(
      ({ BrowserWindow }, p) =>
        BrowserWindow.getAllWindows()[0].webContents.send("desktop-click", p),
      { x: q.x + q.width / 2, y: q.y + q.height / 2 },
    );
    await exit;
    console.log(
      "smoke passed: idle motion, key-dependent rotation, reduced motion, native input, gear routing, debug rest reminder, persisted toggle, recovery, quit",
    );
  } finally {
    if (!closed) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
