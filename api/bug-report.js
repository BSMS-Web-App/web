/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import { db } from './db.js';

export default async function handler(req, res) {

  /*
   * Only POST requests are allowed.
   */

  if (req.method !== 'POST') {

    res.setHeader(
      'Allow',
      'POST'
    );

    return res.status(405).json({
      success: false,
      error: 'Method not allowed.'
    });

  }


  try {

    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Database unavailable.'
      });
    }

    /*
     * ==========================================
     * REQUEST BODY
     * ==========================================
     */

    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : (req.body || {});


    const name =
      typeof body.name === 'string'
        ? body.name.trim()
        : '';


    const area =
      typeof body.area === 'string'
        ? body.area.trim()
        : '';


    const summary =
      typeof body.summary === 'string'
        ? body.summary.trim()
        : '';


    const details =
      typeof body.details === 'string'
        ? body.details.trim()
        : '';


    const sessionId =
      typeof body.sessionId === 'string'
        ? body.sessionId.trim()
        : '';


    const username =
      typeof body.username === 'string'
        ? body.username.trim()
        : '';


    /*
     * ==========================================
     * VALIDATION
     * ==========================================
     */

    const validAreas = [
      'Chat',
      'Countdown',
      'Accounts',
      'Games',
      'Other'
    ];


    if (!validAreas.includes(area)) {

      return res.status(400).json({
        success: false,
        error: 'Please select a valid area.'
      });

    }


    if (!summary) {

      return res.status(400).json({
        success: false,
        error: 'A bug description is required.'
      });

    }


    if (name.length > 100) {

      return res.status(400).json({
        success: false,
        error: 'Name is too long.'
      });

    }


    if (summary.length > 300) {

      return res.status(400).json({
        success: false,
        error: 'Bug description is too long.'
      });

    }


    if (details.length > 3000) {

      return res.status(400).json({
        success: false,
        error: 'Additional information is too long.'
      });

    }


    if (sessionId.length > 100) {

      return res.status(400).json({
        success: false,
        error: 'Invalid session ID.'
      });

    }


    if (username.length > 100) {

      return res.status(400).json({
        success: false,
        error: 'Invalid username.'
      });

    }


    /*
     * ==========================================
     * WRITE REPORT TO SHARED DATABASE
     * ==========================================
     */
    const reportRef = db.ref('/bug-reports').push();
    await reportRef.set(report);

    /*
     * ==========================================
     * SUCCESS
     * ==========================================
     */
    return res.status(200).json({
      success: true,
      id: reportRef.key || null
    });


  } catch (error) {

    console.error(
      'Bug report API error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred.'
    });

  }

}
