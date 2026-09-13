const analyticsService = require('./AnalyticsService');

class AIAnalystService {
  async getInsights(shopId, period = '30days') {
    const data = await analyticsService.getDashboardData(shopId, period);
    
    const insights = [];
    const recommendations = [];
    
    // 1. Revenue Analysis
    const salesGrowth = data.growth.sales;
    if (salesGrowth > 10) {
      insights.push({
        type: 'success',
        title: 'Explosive Growth Detected',
        message: `Your revenue is up ${salesGrowth}% compared to the previous period. Your current sales momentum is high.`
      });
    } else if (salesGrowth < -5) {
      insights.push({
        type: 'danger',
        title: 'Revenue Warning',
        message: `Revenue has dropped by ${Math.abs(salesGrowth)}%. We recommend reviewing your recent pricing or marketing activity.`
      });
    }

    // 2. Profit Margin Analysis
    const margin = data.summary.profitMargin;
    if (margin < 15 && data.kpi.totalOrders >= 20) {
      recommendations.push({
        action: 'Price Optimization Needed',
        reason: `Your recorded gross margin is ${margin.toFixed(1)}% across ${data.kpi.totalOrders} completed orders.`,
        suggestion: 'Review item-level prices and recorded costs. This observation is not an industry benchmark or a causal diagnosis.'
      });
    }

    // 3. Peak Hour Strategy
    if (data.bestSellingHours && data.bestSellingHours.length > 0) {
      const peak = [...data.bestSellingHours].sort((a, b) => Number(b.orders || 0) - Number(a.orders || 0))[0];
      const peakHour = peak.label;
      const hourInt = parseInt(peakHour);
      const ampm = hourInt >= 12 ? 'PM' : 'AM';
      const displayHour = hourInt % 12 || 12;
      
      recommendations.push({
        action: 'Strategic Staffing',
        reason: `Your peak traffic occurs around ${displayHour} ${ampm}.`,
        suggestion: `Ensure maximum staff availability between ${displayHour}:00 and ${(hourInt + 2) % 24}:00 to minimize wait times and maximize order throughput.`
      });
    }

    // 4. Inventory Efficiency
    if (data.topProducts && data.topProducts.length > 0) {
      const top = data.topProducts[0];
      // Recipe menu items do not own a discrete stock quantity. Their ingredients
      // can be shared by many recipes, so claiming "N products remaining" would
      // be misleading. Raw ingredient alerts are handled by inventory monitoring.
      if (top.product_type !== 'recipe_based' && Number(top.stock) < 10) {
        insights.push({
          type: 'warning',
          title: 'Stockout Risk',
          message: `Your #1 best-seller "${top.name}" is running low on stock (${top.stock} remaining). Reorder immediately to avoid lost revenue.`
        });
      }
    }

    // 5. Channel Analysis
    const dining = data.channelBreakdown.find(c => c.label === 'dine_in' || c.label === 'Dine In');
    if (dining && (dining.sales / data.kpi.totalSales) < 0.3) {
      recommendations.push({
        action: 'Boost Dine-in Experience',
        reason: 'Dine-in sales contribute less than 30% of your total revenue.',
        suggestion: 'Consider "Dine-in Only" specials or improving your seating ambiance to increase high-margin on-premise sales.'
      });
    }

    // 6. Return Rate Anomaly
    const returnEventRate = data.kpi.totalOrders > 0 ? (data.summary.totalReturns / data.kpi.totalOrders) * 100 : 0;
    if (data.kpi.totalOrders >= 20 && returnEventRate > 5) {
      insights.push({
        type: 'danger',
        title: 'High Return Rate',
        message: `Return invoices equal ${returnEventRate.toFixed(1)}% of completed orders in this period. One order can have more than one return invoice.`
      });
    }

    return {
      summary: {
        verdict: salesGrowth > 0 ? 'Healthy & Growing' : 'Monitoring Required',
        evidenceLevel: data.kpi.totalOrders >= 100 ? 'High sample' : data.kpi.totalOrders >= 20 ? 'Moderate sample' : 'Low sample',
        lastAnalysis: new Date().toISOString()
      },
      insights,
      recommendations,
      rawMetrics: {
        margin: margin.toFixed(1) + '%',
        growth: salesGrowth.toFixed(1) + '%'
      }
    };
  }
}

module.exports = new AIAnalystService();
