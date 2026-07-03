const { RtcTokenBuilder, RtcRole } = require("agora-token");
const axios = require("axios");

module.exports = async (req, res) => {
  // Clear CORS Setup
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { endpoint } = req.query;

  // ROUTE 1: MODERN AGORA RTC TOKEN GENERATOR
  if (endpoint === "agoraToken") {
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;
    
    const { channelName, uid, role: userRole } = req.query;
    const parsedUid = parseInt(uid) || 0;

    if (!channelName) {
      return res.status(400).json({ error: "channelName is required" });
    }

    // Set roles based on new package requirements
    const role = userRole === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    
    // Modern tokens use an absolute token duration limit in seconds (e.g., 3600 seconds = 1 hour)
    const tokenExpirationInSeconds = 3600;
    const privilegeExpirationInSeconds = 3600;

    try {
      const token = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        parsedUid,
        role,
        tokenExpirationInSeconds,
        privilegeExpirationInSeconds
      );
      return res.status(200).json({ token });
    } catch (error) {
      return res.status(500).json({ error: `Agora Core Error: ${error.message}` });
    }
  }

  // ROUTE 2: PAYSTACK 70/30 SPLIT INITIALIZER
  if (req.method === "POST" && endpoint === "paystack") {
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    const { email, amount, streamerName, momoNumber, provider } = req.body;

    try {
      const subaccountResponse = await axios.post(
        "https://api.paystack.co/subaccount",
        {
          business_name: streamerName,
          settlement_bank: provider,
          account_number: momoNumber,
          percentage_charge: 30 
        },
        {
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      const generatedSubaccountCode = subaccountResponse.data.data.subaccount_code;

      const paymentResponse = await axios.post(
        "https://api.paystack.co/transaction/initialize",
        {
          email: email,
          amount: amount * 100, 
          currency: "GHS",
          subaccount: generatedSubaccountCode
        },
        {
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      return res.status(200).json(paymentResponse.data);
    } catch (error) {
      const errorData = error.response ? error.response.data : error.message;
      return res.status(500).json({ error: errorData });
    }
  }

  return res.status(404).json({ error: "Endpoint not found" });
};
