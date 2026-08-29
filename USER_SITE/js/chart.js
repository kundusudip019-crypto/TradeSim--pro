// TradeSim Pro - Lightweight Animated Demo Trading Chart
// No external chart library required.

(function () {
  "use strict";

  function drawChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let data = [];
    let lastPrice = 68420.35;
    let animationFrame;

    // Create initial price history
    for (let i = 0; i < 90; i++) {
      lastPrice += (Math.random() - 0.48) * 180;
      data.push(lastPrice);
    }

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(rect.width || 600, 320);
      const height = Math.max(rect.height || 270, 250);
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      return {
        width: width,
        height: height
      };
    }

    function draw() {
      const size = resizeCanvas();
      const width = size.width;
      const height = size.height;

      ctx.clearRect(0, 0, width, height);

      // Background
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, "#0d1c30");
      bg.addColorStop(1, "#07111e");

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = "#1b2b42";
      ctx.lineWidth = 1;

      const horizontalLines = 6;
      const verticalLines = 8;

      for (let i = 1; i < horizontalLines; i++) {
        const y = (height / horizontalLines) * i;

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      for (let i = 1; i < verticalLines; i++) {
        const x = (width / verticalLines) * i;

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Calculate range
      let min = Math.min.apply(null, data);
      let max = Math.max.apply(null, data);

      const padding = Math.max((max - min) * 0.12, 20);

      min -= padding;
      max += padding;

      function getY(value) {
        return (
          height -
          28 -
          ((value - min) / (max - min)) *
            (height - 56)
        );
      }

      // Area under chart
      ctx.beginPath();

      data.forEach(function (value, index) {
        const x =
          (index / (data.length - 1)) *
          width;

        const y = getY(value);

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();

      const area = ctx.createLinearGradient(
        0,
        0,
        0,
        height
      );

      area.addColorStop(0, "rgba(70,130,255,0.28)");
      area.addColorStop(1, "rgba(70,130,255,0)");

      ctx.fillStyle = area;
      ctx.fill();

      // Main chart line
      ctx.beginPath();

      data.forEach(function (value, index) {
        const x =
          (index / (data.length - 1)) *
          width;

        const y = getY(value);

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.strokeStyle = "#5f8cff";
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      // Current price
      const currentValue =
        data[data.length - 1];

      const currentY = getY(currentValue);

      // Price guide line
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "#39516f";
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(0, currentY);
      ctx.lineTo(width, currentY);
      ctx.stroke();

      ctx.setLineDash([]);

      // Current price dot
      ctx.beginPath();
      ctx.arc(
        width - 2,
        currentY,
        5,
        0,
        Math.PI * 2
      );

      ctx.fillStyle = "#72efb5";
      ctx.fill();

      // Outer glow
      ctx.beginPath();
      ctx.arc(
        width - 2,
        currentY,
        9,
        0,
        Math.PI * 2
      );

      ctx.strokeStyle =
        "rgba(114,239,181,0.25)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Price label
      const price =
        "₹" +
        currentValue.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });

      ctx.font =
        "bold 12px Segoe UI, Arial";

      const textWidth =
        ctx.measureText(price).width;

      const labelWidth = textWidth + 16;
      const labelHeight = 24;

      let labelX =
        width - labelWidth - 8;

      let labelY =
        currentY - labelHeight - 8;

      if (labelY < 5) {
        labelY = currentY + 8;
      }

      ctx.fillStyle = "#14263c";

      ctx.beginPath();
      ctx.roundRect(
        labelX,
        labelY,
        labelWidth,
        labelHeight,
        5
      );

      ctx.fill();

      ctx.fillStyle = "#8df3c5";

      ctx.fillText(
        price,
        labelX + 8,
        labelY + 16
      );

      // Generate next market movement
      const previous =
        data[data.length - 1];

      // Small realistic movement
      const movement =
        (Math.random() - 0.49) *
        Math.max(previous * 0.002, 35);

      const next =
        Math.max(
          1000,
          previous + movement
        );

      data.push(next);

      // Keep fixed amount of candles/points
      if (data.length > 90) {
        data.shift();
      }

      // Update dashboard market price if available
      const priceElement =
        document.getElementById("marketPrice");

      if (priceElement) {
        priceElement.textContent =
          "₹" +
          next.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
      }

      animationFrame =
        requestAnimationFrame(draw);
    }

    // Initial draw
    draw();

    // Resize redraw
    window.addEventListener(
      "resize",
      function () {
        cancelAnimationFrame(animationFrame);
        draw();
      }
    );
  }

  function initCharts() {
    drawChart("chart");

    // These will work automatically if
    // other pages have these canvas IDs.
    drawChart("heroChart");
    drawChart("tradeChart");
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initCharts
    );
  } else {
    initCharts();
  }
})();