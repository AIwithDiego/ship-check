(function () {
  var $ = function (id) { return document.getElementById(id); };
  var last = "";
  $("base").textContent = location.origin;

  function round(id, pass, score, unit, says) {
    var el = $(id);
    el.dataset.result = pass ? "win" : "lose";
    var sc = el.querySelector(".round__score");
    sc.textContent = String(score);
    var s = document.createElement("small"); s.textContent = unit; sc.append(s);
    el.querySelector(".meter i").style.setProperty("--v", Math.max(4, Math.min(100, unit === "broken" ? score * 12 : score)) + "%");
    el.querySelector(".round__says").textContent = says;
  }
  function chip(pass, text) {
    var c = document.createElement("span"); c.className = "chip"; c.dataset.result = pass ? "win" : "lose"; c.textContent = text; return c;
  }
  function points(c) { return c.works.serious * 25 + c.copy.score + c.look.score; }

  function draw(data) {
    var checks = data.checks || [], board = data.board || [];
    $("count").textContent = String(checks.length >= 20 ? "20+" : checks.length);
    var c = checks[0];
    if (c) {
      var key = c.receipt_id + c.at;
      $("idle").hidden = true; $("rounds").hidden = false; $("call").hidden = false; $("who").hidden = false;
      $("who").textContent = c.name ? c.name : "A site";
      round("r1", c.works.pass, c.works.serious, "broken", c.works.pass ? "Nothing a visitor would hit." : c.works.serious + " thing(s) a visitor would hit.");
      round("r2", c.copy.pass, c.copy.score, "/ 100", c.copy.flags + " line(s) flagged.");
      round("r3", c.look.pass, c.look.score, "/ 100", c.look.flags + " tell(s) flagged.");
      var paid = $("paid");
      paid.textContent = "Paid ";
      var b = document.createElement("b"); b.textContent = c.amount + " USD"; paid.append(b);
      paid.append(" over MPP at " + new Date(c.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + (c.receipt_id ? ", receipt " + c.receipt_id.slice(0, 14) : ""));
      var call = $("call");
      call.textContent = c.ship ? "SHIP IT" : "FIX FIRST";
      call.className = "block call " + (c.ship ? "block--win" : "block--lose") + (key !== last ? " is-new" : "");
      last = key;
    }
    var ol = $("card");
    ol.textContent = "";
    board.slice(0, 12).forEach(function (r, i) {
      var li = document.createElement("li"); li.dataset.ship = String(r.ship);
      var rank = document.createElement("span"); rank.className = "card__rank"; rank.textContent = String(i + 1);
      var name = document.createElement("span"); name.className = "card__name"; name.textContent = r.name;
      var host = document.createElement("span"); host.className = "card__host"; host.textContent = (r.host || "") + ", " + points(r) + " points";
      name.append(host);
      var chips = document.createElement("span"); chips.className = "chips";
      chips.append(chip(r.works.pass, String(r.works.serious)), chip(r.copy.pass, String(r.copy.score)), chip(r.look.pass, String(r.look.score)));
      li.append(rank, name, chips); ol.append(li);
    });
    $("empty").hidden = board.length > 0;
  }
  function tick() {
    fetch("/live/feed", { cache: "no-store" }).then(function (r) { return r.json(); }).then(draw).catch(function () {});
  }
  tick(); setInterval(tick, 2000);
})();
