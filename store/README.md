# Vanta Plugin Store

Plugins in this folder show up in **Settings → Vanta Settings → Plugin Store** for everyone.

- `official/` are plugins made by Vanta. They get the green **Official** badge.
- `community/` are plugins made by anyone. Before installing one, users see a warning that it
  isn't made by Vanta, plus its full code.

"Official" comes **only** from the folder, never from the author name. Anyone can call themselves
"Vanta", so a community plugin whose author or name looks like Vanta (including look-alike letters)
is flagged as **"Not really Vanta"**.

## Submitting a plugin

1. Fork this repo.
2. Add your plugin as **one `.js` file** in `store/community/`, starting with a header like this:

   ```js
   /**
    * @name MyPlugin
    * @author your-name
    * @version 1.0.0
    * @description What it does, in one sentence.
    * @tags chat, utility
    */
   Vanta.definePlugin({
       name: "MyPlugin",
       description: "What it does, in one sentence.",
       authors: ["your-name"],
       start() { /* … */ },
       stop() { /* … */ },
   });
   ```

3. Run `node scripts/store-index.mjs`. It updates `store/plugins.json` with your plugin's details and a
   checksum of the file.
4. Open a pull request.

To update your plugin later, edit the file, run the script again, and open another pull request.

## Rules

Pull requests are reviewed before they're merged. Plugins are rejected if they:

- read or send your login token, or upload anything to a server without saying so in the description
- automate your account (self-bots, auto-replies, spamming, mass DMs)
- pretend to be made by Vanta or by another author
- load and run code from the internet (`eval`, remote scripts) instead of shipping it in the file
- are obfuscated or minified

## How it stays safe

- Every entry in `plugins.json` pins a sha256 of the file that was reviewed. Vanta refuses to
  install a file that doesn't match, so the code can't be swapped after review.
- CI fails if `plugins.json` doesn't match the files (`node scripts/store-index.mjs --check`).
