import * as d3 from "d3";
import boxscore from "./boxscore.json";
import rotation from "./gamerotation.json";
import warriors from "./warriors.json";
import raptors from "./raptors.json";
import getPlayer from "./players";

const appElement = document.querySelectorAll(".rotations-chart")[0];

// NBA Quarter length is 7200ms, but we pick from the box score so this works across all leagues
// may need to change if other league box scores dont have period info
const PERIOD_LENGTH_TIME = boxscore.periods.ps[1].endTime;
const PERIOD_LENGTH_TIME_OVERTIME = 5000;
const GAME_START_TIME = boxscore.periods.ps[0].startTime;
const GAME_END_TIME = boxscore.periods.ps[0].endTime;
const PERIODS = boxscore.periods.ps.slice(1, -2);

const allPlayers = rotation.rows;

// construct team data object, could also be added to the feed
// use TeamsService to get initial team data
const TEAMS = {
  [raptors.id]: raptors,
  [warriors.id]: warriors
};

// the feed includes a list of players but they are not grouped by teamId
// it probably should be updated to group by teamId unless it will be used for something else
const chartData = allPlayers.reduce((prev, player, index) => {
  const TEAM_ID = player.TEAM_ID;
  const PERSON_ID = player.PERSON_ID;

  // team does not exist
  if (!prev[TEAM_ID]) {
    // create new team entry with this player
    const newTeam = {
      ...TEAMS[TEAM_ID],
      players: {
        [PERSON_ID]: [player]
      }
    };

    prev[TEAM_ID] = newTeam;
  } else {
    // team exists with at least one player entry
    const playerEntries = prev[TEAM_ID].players[PERSON_ID];

    // handle cases where we dont have a player entry yet
    const newPlayerEntries = playerEntries
      ? [...playerEntries, player]
      : [player];

    const updatedPlayers = {
      ...prev[TEAM_ID].players,
      [PERSON_ID]: newPlayerEntries
    };

    const updatedTeam = {
      ...prev[TEAM_ID],
      players: updatedPlayers
    };

    prev[TEAM_ID] = updatedTeam;
  }

  return prev;
}, {});

const chartPlayers = Object.values(chartData).reduce((prev, team) => {
  return {
    ...prev,
    ...team.players
  };
}, []);

console.log(chartPlayers);
const totalPlayers = Object.keys(chartPlayers).length;

// start chart
const margin = {
  top: 10,
  right: 50,
  bottom: 10,
  left: 125
};

const maxWidth = appElement.innerWidth;
const width = 700;
const height = 400;
const rowHeight = 18;
const viewStat = "PLAYER_PTS";

// helpers
const xScale = d3
  .scaleLinear()
  .range([0, width])
  .domain([0, GAME_END_TIME]);

const colorDomains = {
  PT_DIFF: [0, 20],
  PLAYER_PTS: [0, 20],
  USG_PCT: [0, 1]
};

const colorDomain = colorDomains[viewStat];
const teamColorScales = {
  "1610612744": d3.scaleSequential(d3.interpolateRdBu).domain(colorDomain),
  "1610612761": d3.scaleSequential(d3.interpolateRdBu).domain(colorDomain)
};

const grid = d3
  .select(".rotations-chart")
  .append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
  .attr("class", "rotations-chart_container");

// x-axis / quarter labels
// add an extra period for final
const finalPeriodLabel = {
  startTime: GAME_END_TIME,
  text: "FINAL"
};

const periodLabels = [...PERIODS, finalPeriodLabel];

grid
  .append("g")
  .attr("class", "x-axis")
  .attr("transform", `translate(${margin.left}, ${height - margin.bottom})`)
  .call(
    d3
      .axisBottom(xScale)
      .tickSizeOuter(0)
      .tickSize(-height + margin.top + margin.bottom)
      .tickValues(periodLabels.map(period => period.startTime))
  )
  .call(g => g.select(".domain").remove());

grid
  .selectAll("text")
  .data(periodLabels)
  .text(period => period.text)
  .attr("text-anchor", "start");

// player rows
grid
  .append("g")
  .attr("class", "chart")
  // .attr("x", 0)
  // .attr("y", height - (rowHeight * totalPlayers))
  .attr("transform", `translate(0, ${height - rowHeight * totalPlayers})`)
  .selectAll("g.row")
  .data(Object.keys(chartPlayers))
  .enter()
  .append("g")
  .call(playerRow);

function playerRow(g) {
  // add and position the row
  g.attr("class", "row")
    .attr(
      "transform",
      (playerId, index) => `translate(-1, ${index * rowHeight})`
    )
    .attr("data-pid", playerId => chartPlayers[playerId][0].PERSON_ID)
    .attr("data-team", playerId => chartPlayers[playerId][0].TEAM_ID);

  // add the player name
  g.append("text")
    .attr("x", margin.left - 2)
    .attr("text-anchor", "end")
    .attr("font-family", "Roboto, sans-serif")
    .attr("font-size", 12)
    .text(playerId => {
      const player = getPlayer(playerId);
      return player.name;
    });

  // create the bubbles
  g.selectAll(".session")
    .data(playerId => chartPlayers[playerId]) // array of court appearances
    .enter()
    .append("rect")
    .attr("class", "session")
    .attr("x", session => {
      const sessionOffset = getSessionStart(session);
      return xScale(sessionOffset) + margin.left + 1;
    })
    .attr("y", -13)
    .attr("width", session => {
      return xScale(session.IN_TIME) - xScale(session.OUT_TIME);
    })
    .attr("height", rowHeight - 1)
    .attr("fill", "black")
    .attr("rx", 0)
    .attr("fill", session =>
      teamColorScales[session.TEAM_ID](session.PLAYER_PTS)
    )
    .append("title")
    .text(
      session =>
        `${session.PT_DIFF} PTS from ${(session.IN_TIME - session.OUT_TIME) /
          600}`
    )
    .transition()
    .duration(100);
}

function getPeriodTime(period) {
  let offsetTime;
  let currentPeriodLength;

  // subtract 1 from period because chart starts at 0
  let periodModifier = period - 1;

  if (period > 4) {
    offsetTime = periodModifier * PERIOD_LENGTH_TIME_OVERTIME;
    currentPeriodLength = PERIOD_LENGTH_TIME_OVERTIME;
  } else {
    offsetTime = periodModifier * PERIOD_LENGTH_TIME;
    currentPeriodLength = PERIOD_LENGTH_TIME;
  }

  return {
    offsetTime: offsetTime,
    currentPeriodLength: currentPeriodLength
  };
}

function getSessionStart(session) {
  const { PERIOD, IN_TIME } = session;
  const { currentPeriodLength, offsetTime } = getPeriodTime(PERIOD);

  return offsetTime + (currentPeriodLength - IN_TIME);
}
