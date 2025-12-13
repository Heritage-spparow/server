const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../Models/User');
console.log('✅ Passport Google Strategy Loaded');
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.API_BASE_URL}/api/auth/google/callback`
    },
    async (_, __, profile, done) => {
      try {
        const email = profile.emails[0].value;
        let user = await User.findOne({ email });

        if (user) {
         
          if (!user.googleId) {
            user.googleId = profile.id;
            user.authProvider = 'google';
            user.isVerified = true;
            await user.save();
          }
        } else {
          // New Google user
          user = await User.create({
            googleId: profile.id,
            authProvider: 'google',
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            email,
            isVerified: true
          });
        }

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

module.exports = passport;
