/* src/components/Bg.jsx */
/* src/components/Bg.jsx */
/* src/components/Bg.jsx */
import { useEffect } from "react";
import "../styles/bg.css";

export default function Bg() {
  useEffect(() => {
    // Exact same structure, but define functions BEFORE calling them.
    var App = {};

    // --- helpers (same as your code) ---
    function segmentAngleRad(Xstart, Ystart, Xtarget, Ytarget, realOrWeb) {
      var result;
      if (Xstart === Xtarget) {
        if (Ystart === Ytarget) result = 0;
        else if (Ystart < Ytarget) result = Math.PI / 2;
        else result = (3 * Math.PI) / 2;
      } else if (Xstart < Xtarget) {
        result = Math.atan((Ytarget - Ystart) / (Xtarget - Xstart));
      } else {
        result = Math.PI + Math.atan((Ytarget - Ystart) / (Xtarget - Xstart));
      }
      result = (result + 2 * Math.PI) % (2 * Math.PI);
      if (!realOrWeb) result = 2 * Math.PI - result;
      return result;
    }

    App.setup = function () {
      // Create canvas (unique id + transparent bg)
      var canvas = document.createElement("canvas");
      canvas.height = window.innerHeight;
      canvas.width = window.innerWidth;
      canvas.id = "BGCanvas";
      canvas.style.backgroundColor = "transparent";
      document.body.appendChild(canvas);

      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.width = canvas.width;
      this.height = canvas.height;

      // State (unchanged)
      this.stepCount = 0;
      this.hasUserClicked = false;
      this.xC = canvas.width / 2;
      this.yC = canvas.height / 2;
      this.target = { x: this.xC, y: this.yC, radius: 20 };
      this.armsPop = 18;
      this.particlesPerArm = 22;
      this.baseArmThickness = 35;

      // Arms
      this.arms = [];
      for (var i = 0; i < this.armsPop; i++) this.arms.push([]);
      this.initialBirth();

      // Forces
      this.gravity = -1;
      this.springStiffness = 0.5;
      this.viscosity = 0.1;
      this.isElastic = false;

      // Resize handler (optional; your original didn’t attach one)
      this._onResize = () => {
        this.canvas.height = window.innerHeight;
        this.canvas.width = window.innerWidth;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.xC = this.canvas.width / 2;
        this.yC = this.canvas.height / 2;
      };
      window.addEventListener("resize", this._onResize);

      // Mouse bindings — exact behavior
      this._onClick = () => {
        this.hasUserClicked = !this.hasUserClicked;
      };
      this._onMouseMove = (event) => {
        this.target.x = event.pageX;
        this.target.y = event.pageY;
      };
      canvas.addEventListener("click", this._onClick);
      canvas.addEventListener("mousemove", this._onMouseMove);
    };

    App.initialBirth = function () {
      for (var armIndex = 0; armIndex < this.arms.length; armIndex++) {
        var arm = this.arms[armIndex];
        var particlesNb =
          this.particlesPerArm + Math.ceil(this.particlesPerArm * Math.random());
        for (var i = 0; i < particlesNb; i++) {
          var x = this.width * Math.random();
          var y = this.height * Math.random();
          var particle = {
            x: x,
            y: y,
            xLast: x,
            yLast: y,
            xSpeed: 0,
            ySpeed: 0,
            stickLength: 10,
            name: "seed" + this.stepCount,
          };
          arm.push(particle);
        }
      }
    };

    App.update = function () {
      this.evolve();
      this.move();
      this.draw();
    };

    App.evolve = function () {
      this.stepCount++;
      this.target.radius = 50 + 30 * Math.sin(this.stepCount / 10);
    };

    App.move = function () {
      if (!this.hasUserClicked) {
        this.target.x = this.xC + 150 * Math.cos(this.stepCount / 50);
        this.target.y = this.yC + 150 * Math.sin(this.stepCount / 20);
      }

      for (var armIndex = 0; armIndex < this.arms.length; armIndex++) {
        var arm = this.arms[armIndex];
        var ownTargetAngle = (2 * Math.PI * armIndex) / this.arms.length;
        var ownTarget = {
          x: this.target.x + this.target.radius * Math.cos(ownTargetAngle),
          y: this.target.y + this.target.radius * Math.sin(ownTargetAngle),
        };
        for (var i = 0; i < arm.length; i++) {
          var p = arm[i];
          var pLead = i === 0 ? ownTarget : arm[i - 1];
          var angle = segmentAngleRad(p.x, p.y, pLead.x, pLead.y, false);
          var dist = Math.sqrt(
            Math.pow(p.x - pLead.x, 2) + Math.pow(p.y - pLead.y, 2)
          );
          var translationDist = dist - p.stickLength;
          if (translationDist < 0) {
            angle += Math.PI;
            translationDist = Math.abs(translationDist);
          }
          var dx = translationDist * Math.cos(angle);
          var dy = translationDist * Math.sin(angle);
          if (!this.isElastic) {
            p.x += dx;
            p.y -= dy;
          }
          var xAcc = this.springStiffness * dx - this.viscosity * p.xSpeed;
          var yAcc =
            this.springStiffness * dy + this.gravity - this.viscosity * p.ySpeed;
          p.xSpeed += xAcc;
          p.ySpeed += yAcc;
          p.x += 0.1 * p.xSpeed;
          p.y -= 0.1 * p.ySpeed;
        }
      }
    };

    App.draw = function () {
      // Only change vs your original: remove dark background fill
      this.ctx.clearRect(0, 0, this.width, this.height);

      // Target
      this.ctx.beginPath();
      this.ctx.arc(this.target.x, this.target.y, 15, 0, 2 * Math.PI, false);
      this.ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      this.ctx.fill();

      // Particles
      for (var armIndex = 0; armIndex < this.arms.length; armIndex++) {
        var arm = this.arms[armIndex];
        for (var i = 0; i < arm.length; i++) {
          var particle = arm[i];
          var particleLead = i !== 0 ? arm[i - 1] : null;

          this.ctx.beginPath();
          this.ctx.arc(
            particle.x,
            particle.y,
            (this.baseArmThickness / 100) * (arm.length - i),
            0,
            2 * Math.PI,
            false
          );
          this.ctx.strokeStyle = "hsla(" + (200 + i * 4) + ", 90%, 50%, 0.7)";
          this.ctx.stroke();

          this.ctx.beginPath();
          this.ctx.lineWidth = 1;
          this.ctx.strokeStyle = "hsla(" + (180 + i * 4) + ", 80%, 50%, 0.7)";
          if (i === 0) this.ctx.moveTo(this.target.x, this.target.y);
          else this.ctx.moveTo(particleLead.x, particleLead.y);
          this.ctx.lineTo(particle.x, particle.y);
          this.ctx.stroke();
        }
      }
    };

    // --- boot AFTER definitions (fixes the error) ---
    App.setup();
    App.frame = function () {
      App.update();
      window.requestAnimationFrame(App.frame);
    };
    App.frame();

    // cleanup
    return () => {
      if (App.canvas) {
        App.canvas.removeEventListener("click", App._onClick);
        App.canvas.removeEventListener("mousemove", App._onMouseMove);
        window.removeEventListener("resize", App._onResize);
        if (App.canvas.parentNode) App.canvas.parentNode.removeChild(App.canvas);
      }
    };
  }, []);

  return null;
}



