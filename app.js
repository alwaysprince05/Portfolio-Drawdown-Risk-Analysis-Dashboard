// Seedable Mulberry32 PRNG
function mulberry32(a) {
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

// Box-Muller transform to generate normally distributed random variables
function randomNormal(mean, stdDev, randFunc) {
    let u = 0, v = 0;
    while(u === 0) u = randFunc(); // Converting [0,1) to (0,1)
    while(v === 0) v = randFunc();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return num * stdDev + mean;
}

// 1D Gaussian filter with boundary reflection matching SciPy
function gaussianFilter1d(arr, sigma) {
    if (sigma <= 0) return arr.slice();
    const size = Math.ceil(sigma * 3);
    const kernel = [];
    let sum = 0;
    
    // Create Gaussian kernel
    for (let i = -size; i <= size; i++) {
        const val = Math.exp(-(i * i) / (2 * sigma * sigma));
        kernel.push(val);
        sum += val;
    }
    
    // Normalize kernel
    for (let i = 0; i < kernel.length; i++) {
        kernel[i] /= sum;
    }
    
    const result = [];
    const len = arr.length;
    
    for (let i = 0; i < len; i++) {
        let weightedSum = 0;
        for (let j = -size; j <= size; j++) {
            let idx = i + j;
            // Reflect boundary conditions
            if (idx < 0) {
                idx = -idx;
            } else if (idx >= len) {
                idx = 2 * len - 2 - idx;
            }
            if (idx < 0 || idx >= len) idx = i;
            
            weightedSum += arr[idx] * kernel[j + size];
        }
        result.push(weightedSum);
    }
    return result;
}

// Global chart variables to allow smooth updates
let priceChartObj = null;
let drawdownChartObj = null;

function runSimulation() {
    // 1. Get input values
    const n = parseInt(document.getElementById('input-n').value);
    const driftRaw = parseFloat(document.getElementById('input-drift').value);
    const scaleRaw = parseFloat(document.getElementById('input-scale').value);
    const sigma = parseFloat(document.getElementById('input-sigma').value);
    const seed = parseInt(document.getElementById('input-seed').value);
    
    // Update Slider Displays
    document.getElementById('val-n-disp').textContent = n;
    document.getElementById('val-drift-disp').textContent = `${driftRaw >= 0 ? '+' : ''}${driftRaw.toFixed(2)}%`;
    document.getElementById('val-scale-disp').textContent = `${scaleRaw.toFixed(2)}%`;
    document.getElementById('val-sigma-disp').textContent = sigma;
    
    // Setup RNG
    const drift = driftRaw / 100;
    const scale = scaleRaw / 100;
    const randFunc = mulberry32(seed);
    
    // 2. Simulate returns and price series
    const returns = [];
    for (let i = 0; i < n; i++) {
        returns.push(randomNormal(drift, scale, randFunc));
    }
    
    // Generate dates starting from 2022-01-01
    const startDate = new Date('2022-01-01');
    const dates = [];
    for (let i = 0; i < n; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        dates.push(d.getTime()); // Unix timestamp for datetime x-axis
    }
    
    // Compute prices: price = 100 * exp(cumsum(returns))
    const prices = [];
    let cumsum = 0;
    for (let i = 0; i < n; i++) {
        cumsum += returns[i];
        prices.push(100 * Math.exp(cumsum));
    }
    
    // 3. Compute metrics
    const initialPrice = prices[0];
    const finalPrice = prices[prices.length - 1];
    const totalReturn = (finalPrice / initialPrice - 1);
    
    // Compute rolling max
    const rollingMax = [];
    let currentMax = -Infinity;
    for (let i = 0; i < n; i++) {
        if (prices[i] > currentMax) {
            currentMax = prices[i];
        }
        rollingMax.push(currentMax);
    }
    
    // Compute drawdown
    const drawdowns = [];
    for (let i = 0; i < n; i++) {
        drawdowns.push((prices[i] - rollingMax[i]) / rollingMax[i]);
    }
    
    // 4. Apply Gaussian filter smoothing
    const smoothPrices = gaussianFilter1d(prices, sigma);
    const smoothRollingMax = gaussianFilter1d(rollingMax, sigma);
    const smoothDrawdowns = gaussianFilter1d(drawdowns, sigma);
    
    // Find max drawdown point
    let maxDdVal = 0;
    let maxDdIdx = 0;
    for (let i = 0; i < n; i++) {
        if (smoothDrawdowns[i] < maxDdVal) {
            maxDdVal = smoothDrawdowns[i];
            maxDdIdx = i;
        }
    }
    
    const maxDdDate = dates[maxDdIdx];
    const maxDdPrice = smoothPrices[maxDdIdx];
    
    // 5. Update KPI stats UI
    document.getElementById('val-final').textContent = `$${finalPrice.toFixed(2)}`;
    
    const returnEl = document.getElementById('val-return');
    returnEl.textContent = `${totalReturn >= 0 ? '+' : ''}${(totalReturn * 100).toFixed(2)}%`;
    
    const cardReturn = document.getElementById('card-return');
    cardReturn.className = `stat-card ${totalReturn >= 0 ? 'accent-emerald' : 'accent-rose'}`;
    returnEl.className = `stat-value ${totalReturn >= 0 ? 'positive' : 'negative'}`;
    
    const maxDdEl = document.getElementById('val-max-dd');
    maxDdEl.textContent = `${(maxDdVal * 100).toFixed(2)}%`;
    
    // 6. Chart Configurations
    const sharedChartOptions = {
        chart: {
            group: 'portfolio-risk-metrics',
            height: '100%',
            toolbar: { show: false },
            zoom: { enabled: true },
            animations: {
                enabled: true,
                easing: 'easeout',
                speed: 300,
                animateGradually: { enabled: false }
            }
        },
        xaxis: {
            type: 'datetime',
            labels: {
                style: { colors: '#64748b', fontSize: '10px', fontFamily: 'Plus Jakarta Sans' },
                datetimeUTC: false
            },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            labels: {
                style: { colors: '#64748b', fontSize: '10px', fontFamily: 'Plus Jakarta Sans' }
            }
        },
        grid: {
            borderColor: 'rgba(255, 255, 255, 0.03)',
            strokeDashArray: 2
        },
        dataLabels: {
            enabled: false
        },
        tooltip: {
            theme: 'dark',
            x: { format: 'dd MMM yyyy' }
        },
        legend: { show: false } // Custom legend is used in HTML
    };
    
    const priceSeries = [
        {
            name: 'Portfolio Value',
            data: smoothPrices.map((val, idx) => [dates[idx], parseFloat(val.toFixed(2))])
        },
        {
            name: 'Rolling Max',
            data: smoothRollingMax.map((val, idx) => [dates[idx], parseFloat(val.toFixed(2))])
        }
    ];
    
    const drawdownSeries = [
        {
            name: 'Drawdown',
            data: smoothDrawdowns.map((val, idx) => [dates[idx], parseFloat((val * 100).toFixed(2))])
        }
    ];
    
    const priceAnnotations = {
        points: [{
            x: maxDdDate,
            y: parseFloat(maxDdPrice.toFixed(2)),
            marker: {
                size: 6,
                fillColor: '#f43f5e',
                strokeColor: '#ffffff',
                strokeWidth: 2,
                radius: 4
            },
            label: {
                borderColor: '#f43f5e',
                style: {
                    color: '#fff',
                    background: '#f43f5e',
                    fontSize: '9px',
                    fontWeight: 600,
                    padding: { left: 4, right: 4, top: 2, bottom: 2 }
                },
                text: 'Max Drawdown'
            }
        }]
    };
    
    const drawdownAnnotations = {
        points: [{
            x: maxDdDate,
            y: parseFloat((maxDdVal * 100).toFixed(2)),
            marker: {
                size: 5,
                fillColor: '#000000',
                strokeColor: '#f43f5e',
                strokeWidth: 2,
                radius: 4
            },
            label: {
                borderColor: '#f43f5e',
                offsetY: -8,
                style: {
                    color: '#fff',
                    background: '#f43f5e',
                    fontSize: '9px',
                    fontWeight: 600,
                    padding: { left: 4, right: 4, top: 2, bottom: 2 }
                },
                text: `Peak decline: ${(maxDdVal * 100).toFixed(2)}%`
            }
        }]
    };

    // Render or update charts
    if (!priceChartObj) {
        // First initialization
        const priceOptions = {
            ...sharedChartOptions,
            chart: {
                ...sharedChartOptions.chart,
                id: 'chart-price',
                type: 'line'
            },
            series: priceSeries,
            colors: ['#06b6d4', '#f59e0b'],
            stroke: {
                width: [2.5, 1.5],
                dashArray: [0, 4]
            },
            yaxis: {
                ...sharedChartOptions.yaxis,
                labels: {
                    ...sharedChartOptions.yaxis.labels,
                    formatter: val => `$${val.toFixed(2)}`
                }
            },
            annotations: priceAnnotations
        };
        priceChartObj = new ApexCharts(document.querySelector("#price-chart"), priceOptions);
        priceChartObj.render();
    } else {
        // Smooth update
        priceChartObj.updateOptions({
            annotations: priceAnnotations
        }, false, false);
        priceChartObj.updateSeries(priceSeries);
    }
    
    if (!drawdownChartObj) {
        // First initialization
        const drawdownOptions = {
            ...sharedChartOptions,
            chart: {
                ...sharedChartOptions.chart,
                id: 'chart-drawdown',
                type: 'area'
            },
            series: drawdownSeries,
            colors: ['#f43f5e'],
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.25,
                    opacityTo: 0.02,
                    stops: [0, 90, 100]
                }
            },
            stroke: { width: 1.5 },
            yaxis: {
                ...sharedChartOptions.yaxis,
                labels: {
                    ...sharedChartOptions.yaxis.labels,
                    formatter: val => `${val.toFixed(2)}%`
                }
            },
            annotations: drawdownAnnotations
        };
        drawdownChartObj = new ApexCharts(document.querySelector("#drawdown-chart"), drawdownOptions);
        drawdownChartObj.render();
    } else {
        // Smooth update
        drawdownChartObj.updateOptions({
            annotations: drawdownAnnotations
        }, false, false);
        drawdownChartObj.updateSeries(drawdownSeries);
    }
}

// Initial Run and input bindings
document.addEventListener('DOMContentLoaded', () => {
    // Generate simulation on load
    runSimulation();
    
    // Bind all ranges to simulate instantly on drag
    const sliders = ['input-n', 'input-drift', 'input-scale', 'input-sigma'];
    sliders.forEach(id => {
        document.getElementById(id).addEventListener('input', runSimulation);
    });
    
    // Bind number seed changes
    document.getElementById('input-seed').addEventListener('input', runSimulation);
    
    // Shuffle seed button
    document.getElementById('btn-shuffle').addEventListener('click', () => {
        const randomSeed = Math.floor(Math.random() * 9999) + 1;
        document.getElementById('input-seed').value = randomSeed;
        runSimulation();
    });
});
