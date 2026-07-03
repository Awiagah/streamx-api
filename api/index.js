const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const axios = require("axios");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { endpoint } = req.query;

  // ROUTE 1: AGORA RTC TOKEN GENERATOR
  if (endpoint === "agoraToken") {
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;
    const { channelName, uid, role: userRole } = req.query;
    const parsedUid = parseInt(uid) || 0;

    if (!channelName) {
      return res.status(400).json({ error: "channelName is required" });
    }

    const role = userRole === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + 3600;

    try {
      const token = RtcTokenBuilder.buildTokenWithUid(
        appId, appCertificate, channelName, parsedUid, role, privilegeExpiredTs
      );
      return res.status(200).json({ token });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // ROUTE 2: DYNAMIC MOMO SUBACCOUNT CREATION + PAYSTACK TRANSACTION SPLIT
  if (req.method === "POST" && endpoint === "paystack") {
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    const { email, amount, streamerName, momoNumber, provider } = req.body;

    try {
      // 1. Tell Paystack to link this streamer's number as a payout subaccount
      const subaccountResponse = await axios.post(
        "https://api.paystack.co/subaccount",
        {
          business_name: streamerName,
          settlement_bank: provider, // "MTN", "Telecel", or "AirtelTigo"
          account_number: momoNumber,  // The streamer's actual MoMo number
          percentage_charge: 30        // StreamX takes 30%, meaning streamer gets 70% automatically
        },
        {
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      const generatedSubaccountCode = subaccountResponse.data.data.subaccount_code;

      // 2. Initialize the checkout linking the split rule we just generated
      const paymentResponse = await axios.post(
        "https://api.paystack.co/transaction/initialize",
        {
          email: email,
          amount: amount * 100, // Converts Cedi to Pesewas
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
