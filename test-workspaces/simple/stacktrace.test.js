describe('stacktrace', () => {
  it('should parse error location correctly', function () {
    console.log('before');
    throw new Error('(...');
    console.log('after');
  });
});
