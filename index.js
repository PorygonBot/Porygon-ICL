//Importing all required libraries for Discord, Showdown, and Google
const ws = require("ws");
const axios = require("axios");
const Discord = require("discord.js");
const getUrls = require("get-urls");

//Constants required to make the program work as intended
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
const { psUsername, psPassword, botToken } = require("./config.json");

const bot = new Discord.Client({ disableEveryone: true });

//When the bot is connected and logged in to Discord
bot.on("ready", async() => {
    console.log(`${bot.user.username} is online!`);
    bot.user.setActivity(`PS battles`, { type: "watching" });
});

//This is connection code to the PS server.
const websocket = new ws("ws://sim.smogon.com:8000/showdown/websocket");
console.log("Server started!");

//When the server has connected
websocket.on("open", function open() {
    console.log("Server connected!");
});

//This is an array filled with all the data sent to me by the server since the bot has last been started
let dataArr = [];
let p1a = "";
let p2a = "";
let players = [];
let battlelink = "";
let pokes1 = [];
let pokes2 = [];
let killer = "";
let victim = "";
let killJson = {};
let deathJson = {};
let winner = "";
let loser = "";
//when the websocket sends a message
websocket.on("message", async function incoming(data) {
    let realdata = data.split("\n");

    //stuff to do after server connects
    if (data.startsWith("|challstr|")) {
        let nonce = data.substring(10);
        let assertion = await login(nonce);
        //logs in
        websocket.send(`|/trn ${psUsername},128,${assertion}|`);
    }

    //removing the `-supereffective` line if it exists in realdata
    for (let element of realdata) {
        if (element.startsWith(`|-supereffective|`)) {
            realdata.splice(realdata.indexOf(element), 1);
        }
    }
    //going through each line in realdata
    for (let line of realdata) {
        dataArr.push(line);
        let linenew = line.substring(1);
        let parts = linenew.split("|");

        if (line.startsWith(`battle`))
            battlelink = line;

        else if (linenew.startsWith(`switch`)) {
            if (linenew.includes("p1a")) p1a = parts[2].split(",")[0];
            else if (linenew.includes("p2a")) p2a = parts[2].split(",")[0];
        }

        //|player|p2|infernapeisawesome|1|
        else if (linenew.startsWith(`player`)) {
            players.push(parts[2]);
            console.log("Players: " + players);
        }

        //|poke|p1|Hatterene, F|
        else if (linenew.startsWith(`poke`)) {
            let pokemon = parts[2].split(",")[0];
            if (parts[1] === "p1") {
                pokes1.push(pokemon);
                killJson[`p1 ${pokemon}`] = 0;
                deathJson[`p1 ${pokemon}`] = 0;
            }
            else if (parts[1] === "p2") {
                pokes2.push(pokemon);
                killJson[`p2 ${pokemon}`] = 0;
                deathJson[`p2 ${pokemon}`] = 0;
            }
        } 
        
        else if (linenew.startsWith("faint")) {
            if (parts[1].substring(0, 3) === "p1a") {
                killer = p2a;
                victim = p1a;
                killJson[`p2 ${killer}`]++;
                deathJson[`p1 ${victim}`]++;
            } else {
                killer = p1a;
                victim = p2a;
                killJson[`p1 ${killer}`]++;
                deathJson[`p2 ${victim}`]++;
            }

            console.log(`${killer} killed ${victim}`);
        }

        else if (linenew.startsWith(`queryresponse|savereplay|`)) {
            let logJson = JSON.parse(parts[2])
            console.log(logJson.id);
        }

        //|win|infernapeisawesome
        else if (linenew.startsWith(`win`)) {
            winner = parts[1];
            console.log(`${winner} won!`);
            console.log("Battle link: ", battlelink);
            websocket.send(`${battlelink}|/savereplay`); //TODO finish this replay thing
            loser = (winner === players[players.length - 2]) ? players[players.length - 1] : players[players.length - 2];
            console.log(`${loser} lost!`);

            //TODO: make it so that the kills/deaths of each match is split up by player, then sent to each player
            // using DM's.
            //Winner sending info.
            let winnerMessage = "";
            let loserMessage = "";

            let winnerP = "";
            let loserP = "";
            if (winner === players[0]) {
                winnerP = "p1";
                loserP = "p2";
            }
            else {
                winnerP = "p2";
                loserP =  "p1";
            }

            for (let key of Object.keys(killJson)) {
                let pokemon = key.substring(3);
                if (key.startsWith(winnerP)) {
                    winnerMessage += `${pokemon} has ${killJson[key]} kills and ${deathJson[key]} deaths. \n`;
                }
                else if (key.startsWith(loserP)) {
                    loserMessage += `${pokemon} has ${killJson[key]} kills and ${deathJson[key]} deaths. \n`;
                }
            }
            (await bot.fetchUser(getDiscord(winner))).send(winnerMessage);
            (await bot.fetchUser(getDiscord(loser))).send(loserMessage);

            //resetting after every game
            dataArr = [];
            p1a = "";
            p2a = "";
            players = [];
            battlelink = "";
            pokes1 = [];
            pokes2 = [];
            killer = "";
            victim = "";
            killJson = {};
            deathJson = {};
            winner = "";
            loser = "";
        }
    }
});

//When a message gets sent on Discord in the channel
bot.on("message", async message => {
    let channel = message.channel;

    if (message.author.bot) return;

    let msgStr = message.content;
    let prefix = "porygon, use"

    if (channel.type === "dm") return;
    else if (
        channel.id === "671133440468320276"
    ) {
        //separates given message into its parts
        let urls = Array.from(getUrls(msgStr)); //This is because getUrls returns a Set
        battleLink = urls[0]; //http://sports.psim.us/battle-gen8legacynationaldex-17597 format

        //joins the battle linked
        if (battleLink) {
            channel.send(`Joining the battle...`);
            console.log(battleLink.substring(33));
            websocket.send(`|/join ${battleLink.substring(33)}`);
            channel.send(`Battle joined! Keeping track of the stats now.`);
            websocket.send(
                `${battleLink.substring(33)}|Battle joined! Keeping track of the stats now.`
            );
        }
    }

    //checks for help command
    if (msgStr.toLowerCase() === `${prefix} help`) {
        let bicon = bot.user.displayAvatarURL;
        let helpEmbed = new Discord.RichEmbed()
        .setTitle("Porygon Help")
        .setThumbnail(bicon)
        .setColor(0xffc0cb)
        .addField("Prefix", "Porygon, use ___")
        .addField("What does Porygon do? ", "It joins a Pokemon Showdown battle when the live battle link is sent to a dedicated channel and keeps track of the deaths/kills in the battle, updating a Stats Sheet at the end.")
        .addField("How do I use Porygon?", `Make a dedicated live-battle-links channel, let @harbar20#9389 know about all the detail he asks you, and that's it!`)
        .addField("Source", "https://github.com/harbar20/Porygon")
        .setFooter("Made by @harbar20#9389", `https://pm1.narvii.com/6568/c5817e2a693de0f2f3df4d47b0395be12c45edce_hq.jpg`);

        return channel.send(helpEmbed);
    }
    else if (msgStr.toLowerCase() === `${prefix} ping`) {
        let m = await channel.send(`Pong!`);
        m.edit(`Pong! Latency: ${m.createdTimestamp - message.createdTimestamp}ms, API latency: ${bot.ping}ms`)
    }
    else if (msgStr.toLowerCase() === `${prefix} tri-attack`) {
        let rand = Math.round(Math.random() * 5);
        let m = await channel.send("Porygon used Tri-Attack!");
        switch (rand) {
            case 1:
                return m.edit("Porygon used Tri-Attack! It burned the target!");
            case 2:
                return m.edit("Porygon used Tri-Attack! It froze the target!");
            case 3:
                return m.edit("Porygon used Tri-Attack! It paralyzed the target!");
            default:
                return m.edit("Porygon used Tri-Attack! No secondary effect on the target.");
        }
    }
});
//making the bot login
bot.login(botToken);

async function login(nonce) {
    let psUrl = "https://play.pokemonshowdown.com/action.php";
    let data = {
        act: "login",
        name: psUsername,
        pass: psPassword,
        challstr: nonce
    };

    let response = await axios.post(psUrl, data);
    let json = JSON.parse(response.data.substring(1));
    console.log("Logged in to PS.");
    return json.assertion;
}

function getDiscord(showdownName) {
    //showdownName: discordUserID
    const tags = {
        "infernapeisawesome": "399021249667399722", //harbar20#9389
        "ASaltyOrange": "506448976342548490", //PokemonTrainerOrange#6912
        "pulsar512b": "504000365843316763", //PulsieTheDulsie#3895
        "BrunoCTK": "469211033609830401", //Its_Bruno#2034x
        "VanillaSnorlax": "417849352124497931", //VanillaSnorlax#4365
        "Fts333": "339567188258193411", //Fts#3452
        "Amerillo": "437788699044872204", //Amerillo#3382
        "red59131": "223827016367996928", //Dead_Red#4119
        "Ort0n": "292481191926431745", //Orton#3909
        "KillingAtLeastOne": "442417955704406037", //OnDaApp#8946
        "DomTom22": "564930489731907594", //DomTom22#1964
        "tiep123": "194461067261247489", //atlanmail#8306
        "jGoya": "207308030700814336" //jGoya#5426
    }
    return tags[showdownName];
}