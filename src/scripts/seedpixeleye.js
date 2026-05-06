// scripts/seedPixelEye.js
// Script to create test PixelEye data in the database

import db from "../database/index.js";

async function seedPixelEye() {
  await db.sequelize.sync();
  const testLeads = [
    {
      date: "2026-05-05",
      time: "10:00",
      call_id: "PX1001",
      customer_name: "Test User 1",
      phone_number: "9000000001",
      agent_name: "Shadan",
      status: "Enquiry",
      day_1: "Enquiry",
      day_2: "Follow-up Required",
      day_3: "Appointment Fixed",
      day_4: "Visited",
      day_5: "Closed",
      client_id: 1,
    },
    {
      date: "2026-05-05",
      time: "11:00",
      call_id: "PX1002",
      customer_name: "Test User 2",
      phone_number: "9000000002",
      agent_name: "PXLS RECEPTION SN",
      status: "Hot Follow-up",
      day_1: "Hot Follow-up",
      day_2: "Appointment Fixed",
      day_3: "Visited",
      day_4: "Closed",
      day_5: "Closed",
      client_id: 1,
    },
  ];
  await db.PixelEye.bulkCreate(testLeads);
  console.log("Test PixelEye data seeded!");
  process.exit(0);
}

seedPixelEye().catch((err) => {
  console.error(err);
  process.exit(1);
});
